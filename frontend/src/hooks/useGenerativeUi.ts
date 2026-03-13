import { useComponent } from "@copilotkit/react-core/v2"
import { PieChart, PieChartPropsSchema } from "@/components/generative-ui/PieChart"

export const useGenerativeUi = () => {
  useComponent({
    name: "pieChart",
    description: "Controlled Generative UI that displays data as a pie chart.",
    parameters: PieChartPropsSchema,
    render: PieChart,
  })
}
