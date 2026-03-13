"use client"

import { useEffect, useState } from "react"
import { CopilotChat, CopilotKitProvider } from "@copilotkit/react-core/v2"
import { useAuth as useOidcAuth } from "react-oidc-context"
import { loadAwsConfig, type AwsExportsConfig } from "@/lib/runtime-config"
import { useExampleSuggestions } from "@/hooks/useExampleSuggestions"
import { useGenerativeUi } from "@/hooks/useGenerativeUi"
const COPILOTKIT_AGENT_ID = "default"

function CopilotChatContent() {
  useExampleSuggestions()
  useGenerativeUi()

  return (
    <div className="h-full [&_.copilotKitChat]:h-full [&_.copilotKitChat]:border-0 [&_.copilotKitChat]:shadow-none">
      <CopilotChat agentId={COPILOTKIT_AGENT_ID} className="h-full" />
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
        if (!isMounted) {
          return
        }

        if (!runtimeConfig || !runtimeConfig.copilotKitRuntimeUrl) {
          throw new Error("CopilotKit runtime URL not found in configuration")
        }

        setConfig(runtimeConfig)
      } catch (err) {
        if (!isMounted) {
          return
        }

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
    <div className="h-full bg-[#f5f7fb]">
      <CopilotKitProvider
        runtimeUrl={config.copilotKitRuntimeUrl}
        headers={accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined}
      >
        <CopilotChatContent />
      </CopilotKitProvider>
    </div>
  )
}
