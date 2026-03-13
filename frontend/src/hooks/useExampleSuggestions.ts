import { useConfigureSuggestions } from "@copilotkit/react-core/v2"

export const useExampleSuggestions = () => {
  useConfigureSuggestions({
    suggestions: [
      {
        title: "Pie chart",
        message: "Please show me a pie chart using sample data.",
      },
    ],
    available: "always",
  })
}
