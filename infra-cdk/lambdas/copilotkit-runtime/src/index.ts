// CopilotKit runtime Lambda — bridges CopilotKit frontend protocol to an
// AG-UI agent running in Amazon Bedrock AgentCore.
//
// Expects a single environment variable:
//   AGENTCORE_AG_UI_URL — the AgentCore runtime invocations endpoint

import { HttpAgent } from "@ag-ui/client"
import { CopilotRuntime, createCopilotEndpoint } from "@copilotkit/runtime/v2"
import { streamHandle } from "hono/aws-lambda"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} environment variable is required`)
  return value
}

const app = createCopilotEndpoint({
  basePath: "/copilotkit",
  runtime: new CopilotRuntime({
    agents: {
      default: new HttpAgent({
        url: requireEnv("AGENTCORE_AG_UI_URL"),
      })
    },
  }),
})

export const handler: (...args: unknown[]) => unknown = streamHandle(app) as (
  ...args: unknown[]
) => unknown
