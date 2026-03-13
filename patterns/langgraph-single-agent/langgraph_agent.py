# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import base64
import json
import os
import traceback
from typing import Any

from ag_ui.core import RunAgentInput, RunErrorEvent, RunFinishedEvent
from bedrock_agentcore.identity.auth import requires_access_token
from bedrock_agentcore.runtime import BedrockAgentCoreApp, RequestContext
from copilotkit import CopilotKitMiddleware, LangGraphAGUIAgent
from langchain.agents import create_agent
from langchain_aws import ChatBedrock
from langchain_core.messages import AIMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph_checkpoint_aws import AgentCoreMemorySaver

from utils.ssm import get_ssm_parameter

app = BedrockAgentCoreApp()

ACTOR_ID_KEYS = ("actor_id", "actorId", "user_id", "userId", "sub")

SYSTEM_PROMPT = """You are a helpful assistant with access to tools via the Gateway.
When asked about your tools, list them and explain what they do."""


def serialize_agui_event(event: Any) -> dict[str, Any]:
    if hasattr(event, "model_dump"):
        return event.model_dump(mode="json", by_alias=True, exclude_none=True)
    if isinstance(event, dict):
        return event
    raise TypeError(f"Unsupported AG-UI event type: {type(event).__name__}")


def decode_jwt_sub(authorization_header: str | None) -> str | None:
    if not authorization_header:
        return None

    parts = authorization_header.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    token_parts = parts[1].split(".")
    if len(token_parts) < 2:
        return None

    try:
        payload = token_parts[1]
        payload += "=" * ((4 - len(payload) % 4) % 4)
        decoded = base64.urlsafe_b64decode(payload.encode("utf-8"))
        sub = json.loads(decoded).get("sub")
        return sub if isinstance(sub, str) and sub else None
    except Exception:
        return None


def resolve_actor_id(
    input_data: RunAgentInput, authorization_header: str | None
) -> str | None:
    forwarded_props = (
        input_data.forwarded_props
        if isinstance(input_data.forwarded_props, dict)
        else {}
    )

    for key in ACTOR_ID_KEYS:
        value = forwarded_props.get(key)
        if isinstance(value, str) and value:
            return value

    return decode_jwt_sub(authorization_header)


@requires_access_token(
    provider_name=os.environ["GATEWAY_CREDENTIAL_PROVIDER_NAME"],
    auth_flow="M2M",
    scopes=[],
)
async def _fetch_gateway_token(access_token: str) -> str:
    return access_token


async def create_gateway_mcp_client() -> MultiServerMCPClient:
    stack_name = os.environ.get("STACK_NAME")
    if not stack_name:
        raise ValueError("STACK_NAME environment variable is required")

    if not stack_name.replace("-", "").replace("_", "").isalnum():
        raise ValueError("Invalid STACK_NAME format")

    gateway_url = get_ssm_parameter(f"/{stack_name}/gateway_url")
    fresh_token = await _fetch_gateway_token()

    return MultiServerMCPClient(
        {
            "gateway": {
                "transport": "streamable_http",
                "url": gateway_url,
                "headers": {
                    "Authorization": f"Bearer {fresh_token}",
                },
            }
        }
    )


def _build_model(streaming: bool) -> ChatBedrock:
    return ChatBedrock(
        model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        temperature=0.1,
        max_tokens=16384,
        streaming=streaming,
        beta_use_converse_api=True,
    )


def _build_checkpointer() -> AgentCoreMemorySaver:
    memory_id = os.environ.get("MEMORY_ID")
    if not memory_id:
        raise ValueError("MEMORY_ID environment variable is required")

    return AgentCoreMemorySaver(
        memory_id=memory_id,
        region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
    )


async def create_langgraph_agent(tools: list):
    try:
        return create_agent(
            model=_build_model(streaming=True),
            tools=tools,
            checkpointer=_build_checkpointer(),
            middleware=[CopilotKitMiddleware()],
            system_prompt=SYSTEM_PROMPT,
        )
    except Exception as error:
        print(f"[AGENT ERROR] Error creating LangGraph agent: {error}")
        print(f"[AGENT ERROR] Exception type: {type(error).__name__}")
        traceback.print_exc()
        raise


async def create_runtime_graph():
    mcp_client = await create_gateway_mcp_client()
    tools = await mcp_client.get_tools()
    return await create_langgraph_agent(tools)


def _reconstruct_tool_calls(msg: AIMessage) -> list:
    """Reconstruct tool_calls from tool_use content blocks.

    AgentCoreMemorySaver.clean_orphan_tool_calls strips tool_calls from AIMessages
    that have no matching ToolMessage (frontend tool calls resolved by the UI).
    The tool_use content blocks are preserved. We rebuild tool_calls from them.
    """
    tool_calls = []
    for block in msg.content:
        if not isinstance(block, dict) or block.get("type") != "tool_use":
            continue
        inp = block.get("input", {})
        if isinstance(inp, str):
            try:
                inp = json.loads(inp) if inp else {}
            except Exception:
                inp = {}
        tool_calls.append({
            "id": str(block.get("id", "")),
            "name": str(block.get("name", "")),
            "args": inp,
            "type": "tool_call",
        })
    return tool_calls


class ActorAwareLangGraphAgent(LangGraphAGUIAgent):
    def _filter_orphan_tool_messages(self, messages: list) -> list:
        """Restore tool_calls stripped by clean_orphan_tool_calls for MESSAGES_SNAPSHOT.

        Without tool_calls, MESSAGES_SNAPSHOT omits toolCalls for frontend tool calls.
        The CopilotKit client then overwrites message state from the snapshot, removing
        the rendered component (e.g. pie chart). Restoring tool_calls here ensures the
        snapshot includes them so the UI component persists and CopilotKitRunner.connect()
        can replay TOOL_CALL_RESULT events on reconnect.
        """
        messages = super()._filter_orphan_tool_messages(messages)
        result = []
        for msg in messages:
            if isinstance(msg, AIMessage) and isinstance(msg.content, list) and not msg.tool_calls:
                tool_calls = _reconstruct_tool_calls(msg)
                if tool_calls:
                    msg = AIMessage(content=msg.content, tool_calls=tool_calls, id=msg.id)
            result.append(msg)
        return result

    def langgraph_default_merge_state(self, state, messages, input):
        result = super().langgraph_default_merge_state(state, messages, input)
        # clean_orphan_tool_calls strips tool_calls from AIMessages with no ToolMessage
        # in the checkpoint. When Run 2 (triggered by CopilotKit after a frontend tool
        # call) adds the ToolMessage, the AIMessage still has tool_calls=[].
        # _fix_messages_for_bedrock then strips the tool_use content block → orphan
        # ToolMessage → Bedrock error. Fix: prepend repaired AIMessages to result so
        # add_messages replaces them by ID before the LLM is re-invoked.
        existing = state.get("messages", []) if state else []
        repairs = [
            AIMessage(content=msg.content, tool_calls=_reconstruct_tool_calls(msg), id=msg.id)
            for msg in existing
            if isinstance(msg, AIMessage)
            and isinstance(msg.content, list)
            and not msg.tool_calls
            and _reconstruct_tool_calls(msg)
        ]
        if repairs:
            result["messages"] = repairs + list(result.get("messages", []))
        return result

    async def get_checkpoint_before_message(self, message_id: str, thread_id: str):
        """Override to inject actor_id required by AgentCoreMemorySaver."""
        if not thread_id:
            raise ValueError("Missing thread_id in config")

        actor_id = (
            self.config.get("configurable", {}).get("actor_id") if self.config else None
        )
        config: dict = {"configurable": {"thread_id": thread_id}}
        if actor_id:
            config["configurable"]["actor_id"] = actor_id

        history_list = []
        async for snapshot in self.graph.aget_state_history(config):
            history_list.append(snapshot)

        history_list.reverse()
        for idx, snapshot in enumerate(history_list):
            messages = snapshot.values.get("messages", [])
            if any(getattr(m, "id", None) == message_id for m in messages):
                if idx == 0:
                    empty_snapshot = snapshot
                    empty_snapshot.values["messages"] = []
                    return empty_snapshot

                snapshot_values_without_messages = snapshot.values.copy()
                del snapshot_values_without_messages["messages"]
                checkpoint = history_list[idx - 1]
                merged_values = {**checkpoint.values, **snapshot_values_without_messages}
                checkpoint = checkpoint._replace(values=merged_values)
                return checkpoint

        raise ValueError("Message ID not found in history")

    async def run(self, input: RunAgentInput):
        actor_id = (
            self.config.get("configurable", {}).get("actor_id") if self.config else None
        )
        if not actor_id:
            raise ValueError(
                "Missing actor identity. Provide forwardedProps.actor_id/user_id "
                "or include sub claim in the bearer token."
            )

        self.graph = await create_runtime_graph()
        self.config = {"configurable": {"actor_id": actor_id}}
        async for event in super().run(input):
            yield event


@app.entrypoint
async def invocations(payload: dict, context: RequestContext):
    input_data = RunAgentInput.model_validate(payload)
    authorization_header = None
    if context.request_headers:
        authorization_header = context.request_headers.get("Authorization")

    actor_id = resolve_actor_id(input_data, authorization_header)
    if not actor_id:
        raise ValueError(
            "Missing actor identity. Provide forwardedProps.actor_id/user_id "
            "or include sub claim in the bearer token."
        )

    request_agent = ActorAwareLangGraphAgent(
        name="LangGraphSingleAgent",
        description="LangGraph single agent exposed via AG-UI",
        graph=None,
        config={"configurable": {"actor_id": actor_id}},
    )

    saw_terminal_event = False
    try:
        async for event in request_agent.run(input_data):
            event_type = getattr(getattr(event, "type", None), "value", None) or getattr(
                event, "type", None
            )
            if event_type in {"RUN_FINISHED", "RUN_ERROR"}:
                saw_terminal_event = True
            yield serialize_agui_event(event)
    except Exception as exc:
        if isinstance(exc, asyncio.CancelledError):
            return
        saw_terminal_event = True
        yield serialize_agui_event(
            RunErrorEvent(
                message=str(exc) or type(exc).__name__,
                code=type(exc).__name__,
            )
        )

    if not saw_terminal_event:
        yield serialize_agui_event(
            RunFinishedEvent(
                threadId=input_data.thread_id or "unknown",
                runId=input_data.run_id or "unknown",
            )
        )


if __name__ == "__main__":
    app.run()
