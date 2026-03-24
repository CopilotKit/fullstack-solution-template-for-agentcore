// CopilotKit chat interface — optional alternative to ChatInterface.
// To enable: uncomment the CopilotKitChatInterface import and usage in ChatPage.tsx,
// and uncomment the CSS import in main.tsx.

import { useEffect, useState } from "react"
import { CopilotChat, CopilotKitProvider } from "@copilotkit/react-core/v2"
import { useAuth as useOidcAuth } from "react-oidc-context"

export default function CopilotKitChatInterface() {
  const auth = useOidcAuth()
  const [runtimeUrl, setRuntimeUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    fetch("/aws-exports.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load config: ${r.status}`)
        return r.json()
      })
      .then((config) => {
        if (!mounted) return
        if (!config.copilotKitRuntimeUrl) {
          throw new Error("copilotKitRuntimeUrl not found in aws-exports.json")
        }
        setRuntimeUrl(config.copilotKitRuntimeUrl)
      })
      .catch((err) => {
        if (mounted) setError(err.message)
      })
    return () => { mounted = false }
  }, [])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-600">
        {error}
      </div>
    )
  }

  if (!runtimeUrl) {
    return (
      <div className="flex h-full items-center justify-center text-sm">
        Loading CopilotKit...
      </div>
    )
  }

  const token = auth.user?.access_token ?? auth.user?.id_token

  return (
    <CopilotKitProvider
      runtimeUrl={runtimeUrl}
      headers={token ? { Authorization: `Bearer ${token}` } : undefined}
    >
      <CopilotChat className="h-full" />
    </CopilotKitProvider>
  )
}
