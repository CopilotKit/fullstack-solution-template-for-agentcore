// frontend/src/components/chat/CopilotChatInterface.tsx
"use client"

import { useEffect, useState } from "react"
import { CopilotChat, CopilotKitProvider } from "@copilotkit/react-core/v2"
import { useAuth as useOidcAuth } from "react-oidc-context"
import { loadAwsConfig, type AwsExportsConfig } from "@/lib/runtime-config"
import { useExampleSuggestions } from "@/hooks/useExampleSuggestions"
import { useCopilotExamples } from "@/hooks/useCopilotExamples"
import { ThemeProvider } from "@/hooks/useTheme"
import { TodoCanvas } from "@/components/canvas/TodoCanvas"

const COPILOTKIT_AGENT_ID = "default"

function CopilotChatContent() {
  useExampleSuggestions()
  useCopilotExamples()

  return (
    <div className="h-full flex">
      {/* Chat pane — takes remaining width */}
      <div className="flex-1 min-w-0 [&_.copilotKitChat]:h-full [&_.copilotKitChat]:border-0 [&_.copilotKitChat]:shadow-none">
        <CopilotChat agentId={COPILOTKIT_AGENT_ID} className="h-full" />
      </div>
      {/* Canvas pane — always visible, shows empty state when no todos exist */}
      <div className="w-2/5 border-l border-gray-200 dark:border-zinc-700">
        <TodoCanvas />
      </div>
    </div>
  )
}

export default function CopilotChatInterface() {
  const auth = useOidcAuth()
  const [config, setConfig] = useState<AwsExportsConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function resolveConfig() {
      try {
        const runtimeConfig = await loadAwsConfig()
        if (!isMounted) return

        if (!runtimeConfig || !runtimeConfig.copilotKitRuntimeUrl) {
          throw new Error("CopilotKit runtime URL not found in configuration")
        }

        setConfig(runtimeConfig)
      } catch (err) {
        if (!isMounted) return
        const message = err instanceof Error ? err.message : "Unknown error"
        setError(`Configuration error: ${message}`)
      }
    }

    resolveConfig()
    return () => {
      isMounted = false
    }
  }, [])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-600">
        {error}
      </div>
    )
  }

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm">
        Loading CopilotKit configuration...
      </div>
    )
  }

  const accessToken = auth.user?.access_token ?? auth.user?.id_token

  return (
    <ThemeProvider>
      <div className="h-full bg-[#f5f7fb]">
        <CopilotKitProvider
          runtimeUrl={config.copilotKitRuntimeUrl}
          headers={accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined}
        >
          <CopilotChatContent />
        </CopilotKitProvider>
      </div>
    </ThemeProvider>
  )
}
