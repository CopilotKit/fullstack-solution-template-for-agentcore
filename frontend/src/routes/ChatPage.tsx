"use client"
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import ChatInterface from "@/components/chat/ChatInterface"
// import CopilotKitChatInterface from "@/components/chat/CopilotKit"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { GlobalContextProvider } from "@/app/context/GlobalContext"

export default function ChatPage() {
  const { isAuthenticated, signIn } = useAuth()

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-4xl">Please sign in</p>
        <Button onClick={() => signIn()}>Sign In</Button>
      </div>
    )
  }

  return (
    <GlobalContextProvider>
      <div className="relative h-screen">
        {/* To use CopilotKit, swap the line below: */}
        <ChatInterface />
        {/* <CopilotKitChatInterface /> */}
      </div>
    </GlobalContextProvider>
  )
}
