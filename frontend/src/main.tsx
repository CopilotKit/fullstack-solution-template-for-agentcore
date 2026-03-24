// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./styles/globals.css"
// Uncomment to enable CopilotKit UI:
// import "@copilotkit/react-core/v2/styles.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
