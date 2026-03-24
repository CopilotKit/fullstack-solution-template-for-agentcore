// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { CopilotChat } from "@copilotkit/react-core/v2"
import { useExampleSuggestions } from "./examples/hooks/useExampleSuggestions"
import { useExampleGenerativeUI } from "./examples/hooks/useExampleGenerativeUI"

export function CopilotKitChat() {
  useExampleSuggestions()
  useExampleGenerativeUI()

  return <CopilotChat className="h-full" />
}
