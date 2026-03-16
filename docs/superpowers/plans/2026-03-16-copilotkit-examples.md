# CopilotKit Examples Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the FAST `CopilotKitChatInterface` with bar chart, theme toggle, tool reasoning, meeting scheduler, and shared todo canvas examples ported from the `with-langgraph-python` reference repo.

**Architecture:** New UI components live under `frontend/src/components/generative-ui/` (charts, scheduler) and `frontend/src/components/canvas/` (todo board). A new `useCopilotExamples.tsx` hook consolidates all CopilotKit registrations, replacing the narrow `useGenerativeUi.ts`. `CopilotChatInterface.tsx` gains a permanently-visible right-side canvas pane (40% width) and a `ThemeProvider` wrapper. On the backend, `patterns/langgraph-single-agent/tools/` gains `query_data.py`, `todos.py`, and `db.csv` with an extended `AgentState` that includes a `todos` field.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + @testing-library/react, Tailwind CSS v4, Recharts 3, Zod 3, `@copilotkit/react-core` v1.54 (`/v2` imports), LangChain >= 0.3 (confirmed: `ToolRuntime` at `langchain.tools`), LangGraph 1.x, Python 3.10+

---

## Chunk 1: Frontend Components

### Task 1: Theme hook

**Files:**
- Create: `frontend/src/hooks/useTheme.tsx`

> **TDD exception:** This file is a React context provider with no branching business logic — its only behavior is toggling CSS classes on `document.documentElement`. Rendering the context with JSDOM would require mocking `window.matchMedia`. The smoke test in Task 6 covers the import and the public API surface. This is a deliberate TDD exception.

- [ ] **Step 1: Create `useTheme.tsx`**

```tsx
// frontend/src/hooks/useTheme.tsx
import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "system",
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("system")

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove("light", "dark")

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)")
      const apply = () => {
        root.classList.remove("light", "dark")
        root.classList.add(mq.matches ? "dark" : "light")
      }
      apply()
      mq.addEventListener("change", apply)
      return () => mq.removeEventListener("change", apply)
    }

    root.classList.add(theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useTheme.tsx
git commit -m "feat(frontend): add ThemeProvider and useTheme hook"
```

---

### Task 2: BarChart component

**Files:**
- Create: `frontend/src/components/generative-ui/BarChart.tsx`
- Test: `frontend/src/test/bar-chart.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/test/bar-chart.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BarChart } from "@/components/generative-ui/BarChart"

const SAMPLE_DATA = [
  { label: "Engineering", value: 42000 },
  { label: "Marketing", value: 12000 },
  { label: "Infrastructure", value: 8200 },
]

describe("BarChart", () => {
  it("renders title and description", () => {
    render(
      <BarChart title="Expenses" description="By category" data={SAMPLE_DATA} />
    )
    expect(screen.getByText("Expenses")).toBeDefined()
    expect(screen.getByText("By category")).toBeDefined()
  })

  it("renders empty state when data is empty array", () => {
    render(<BarChart title="Empty" description="No data" data={[]} />)
    expect(screen.getByText("No data available")).toBeDefined()
  })

  it("renders empty state when data prop is missing", () => {
    // @ts-expect-error testing missing data
    render(<BarChart title="Empty" description="No data" />)
    expect(screen.getByText("No data available")).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- bar-chart
```
Expected: FAIL — "Cannot find module '@/components/generative-ui/BarChart'"

- [ ] **Step 3: Create `BarChart.tsx`**

Uses the same `CHART_COLORS` and `TOOLTIP_STYLE` convention as the existing `PieChart.tsx`.

```tsx
// frontend/src/components/generative-ui/BarChart.tsx
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { z } from "zod"

const CHART_COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#f97316"]

const TOOLTIP_STYLE = {
  backgroundColor: "var(--chart-tooltip-bg)",
  border: "1px solid var(--chart-tooltip-border)",
  borderRadius: "8px",
  padding: "8px 12px",
  color: "var(--foreground)",
}

export const BarChartPropsSchema = z.object({
  title: z.string().describe("Chart title"),
  description: z.string().describe("Brief description or subtitle"),
  data: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
    })
  ),
})

type BarChartProps = z.infer<typeof BarChartPropsSchema>

export function BarChart({ title, description, data }: BarChartProps) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="rounded-xl border dark:border-zinc-700 shadow-sm p-6 max-w-2xl mx-auto my-6 bg-[var(--background)]">
        <div className="mb-4">
          <h3 className="text-xl font-bold dark:text-white">{title}</h3>
          <p className="text-sm text-gray-600 dark:text-zinc-400">{description}</p>
        </div>
        <p className="text-gray-500 dark:text-zinc-400 text-center py-8">No data available</p>
      </div>
    )
  }

  const coloredData = data.map((entry, index) => ({
    ...entry,
    fill: CHART_COLORS[index % CHART_COLORS.length],
  }))

  return (
    <div className="rounded-xl border dark:border-zinc-700 shadow-sm p-6 max-w-2xl mx-auto my-6 bg-[var(--background)]">
      <div className="mb-4">
        <h3 className="text-xl font-bold dark:text-white">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-zinc-400">{description}</p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <RechartsBarChart data={coloredData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--chart-axis)" />
          <YAxis tick={{ fontSize: 12 }} stroke="var(--chart-axis)" />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar isAnimationActive={false} dataKey="value" radius={[4, 4, 0, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npm test -- bar-chart
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/generative-ui/BarChart.tsx frontend/src/test/bar-chart.test.tsx
git commit -m "feat(frontend): add BarChart generative UI component"
```

---

### Task 3: ToolReasoning component

**Files:**
- Create: `frontend/src/components/generative-ui/ToolReasoning.tsx`

> **Test note — deliberate exclusion:** `ToolReasoning` is a purely presentational component with two rendering branches (`entries.length > 0` and a spinner/check status indicator). Unit-testing it with JSDOM would require mocking `useRef` behavior and ResizeObserver for `<details>`. The component is visually verified in manual smoke tests and its import is checked in the `copilot-examples` smoke test in Task 6. No dedicated test file is written.

- [ ] **Step 1: Create `ToolReasoning.tsx`**

```tsx
// frontend/src/components/generative-ui/ToolReasoning.tsx
import { useEffect, useRef } from "react"

interface ToolReasoningProps {
  name: string
  args?: object | unknown
  status: string
}

const statusIndicator = {
  executing: (
    <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
  ),
  inProgress: (
    <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
  ),
  complete: <span className="text-green-500 text-xs">✓</span>,
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.length} items]`
  if (typeof value === "object" && value !== null)
    return `{${Object.keys(value).length} keys}`
  if (typeof value === "string") return `"${value}"`
  return String(value)
}

export function ToolReasoning({ name, args, status }: ToolReasoningProps) {
  const entries = args ? Object.entries(args as Record<string, unknown>) : []
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const toolStatus = status as "complete" | "inProgress" | "executing"

  // Auto-open while executing, auto-close when complete
  useEffect(() => {
    if (!detailsRef.current) return
    detailsRef.current.open = status === "executing"
  }, [status])

  return (
    <div className="my-2 text-sm">
      {entries.length > 0 ? (
        <details ref={detailsRef} open>
          <summary className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer list-none">
            {statusIndicator[toolStatus]}
            <span className="font-medium">{name}</span>
            <span className="text-[10px]">▼</span>
          </summary>
          <div className="pl-5 mt-1 space-y-1 text-xs text-gray-500 dark:text-zinc-400">
            {entries.map(([key, value]) => (
              <div key={key} className="flex gap-2 min-w-0">
                <span className="font-medium shrink-0">{key}:</span>
                <span className="text-gray-600 dark:text-gray-400 truncate">
                  {formatValue(value)}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : (
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          {statusIndicator[toolStatus]}
          <span className="font-medium">{name}</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/generative-ui/ToolReasoning.tsx
git commit -m "feat(frontend): add ToolReasoning default tool renderer"
```

---

### Task 4: MeetingTimePicker component

**Files:**
- Create: `frontend/src/components/generative-ui/MeetingTimePicker.tsx`
- Test: `frontend/src/test/meeting-time-picker.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/test/meeting-time-picker.test.tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MeetingTimePicker } from "@/components/generative-ui/MeetingTimePicker"

describe("MeetingTimePicker", () => {
  it("renders the scheduling prompt and reason when status is executing", () => {
    render(
      <MeetingTimePicker
        status="executing"
        respond={vi.fn()}
        reasonForScheduling="Learn about CopilotKit"
      />
    )
    expect(screen.getByText("Learn about CopilotKit")).toBeDefined()
    expect(screen.getByText("Select a time that works for you")).toBeDefined()
  })

  it("calls respond with the selected slot text when a time slot is clicked", () => {
    const respond = vi.fn()
    render(<MeetingTimePicker status="executing" respond={respond} />)
    // Default first slot is "Tomorrow"
    fireEvent.click(screen.getByText("Tomorrow"))
    expect(respond).toHaveBeenCalledWith(expect.stringContaining("Tomorrow"))
  })

  it("shows confirmation state after selecting a slot", () => {
    render(<MeetingTimePicker status="executing" respond={vi.fn()} />)
    fireEvent.click(screen.getByText("Tomorrow"))
    expect(screen.getByText("Meeting Scheduled")).toBeDefined()
  })

  it("shows declined state when 'None of these work' is clicked", () => {
    const respond = vi.fn()
    render(<MeetingTimePicker status="executing" respond={respond} />)
    fireEvent.click(screen.getByText("None of these work"))
    expect(screen.getByText("No Time Selected")).toBeDefined()
    expect(respond).toHaveBeenCalledWith(expect.stringContaining("declined"))
  })

  it("does not render time slots when status is inProgress", () => {
    render(<MeetingTimePicker status="inProgress" respond={vi.fn()} />)
    expect(screen.queryByText("None of these work")).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- meeting-time-picker
```
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Create `MeetingTimePicker.tsx`**

```tsx
// frontend/src/components/generative-ui/MeetingTimePicker.tsx
import { useState } from "react"

export interface TimeSlot {
  date: string
  time: string
  duration?: string
}

export interface MeetingTimePickerProps {
  status: "inProgress" | "executing" | "complete"
  respond?: (response: string) => void
  reasonForScheduling?: string
  meetingDuration?: number
  title?: string
  timeSlots?: TimeSlot[]
}

export function MeetingTimePicker({
  status,
  respond,
  reasonForScheduling,
  meetingDuration,
  title = "Schedule a Meeting",
  timeSlots = [
    { date: "Tomorrow", time: "2:00 PM", duration: "30 min" },
    { date: "Friday", time: "10:00 AM", duration: "30 min" },
    { date: "Next Monday", time: "3:00 PM", duration: "30 min" },
  ],
}: MeetingTimePickerProps) {
  const displayTitle = reasonForScheduling || title
  const slots = meetingDuration
    ? timeSlots.map((slot) => ({ ...slot, duration: `${meetingDuration} min` }))
    : timeSlots
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [declined, setDeclined] = useState(false)

  const handleSelectSlot = (slot: TimeSlot) => {
    setSelectedSlot(slot)
    respond?.(
      `Meeting scheduled for ${slot.date} at ${slot.time}${slot.duration ? ` (${slot.duration})` : ""}.`
    )
  }

  const handleDecline = () => {
    setDeclined(true)
    respond?.(
      "The user declined all proposed meeting times. Please suggest alternative times or ask for their availability."
    )
  }

  return (
    <div className="rounded-2xl shadow-lg max-w-md w-full border dark:border-zinc-700 mx-auto mb-6 bg-white dark:bg-zinc-800">
      <div className="backdrop-blur-md p-8 w-full rounded-2xl">
        {selectedSlot ? (
          <div className="text-center">
            <div className="text-7xl mb-4">📅</div>
            <h2 className="text-2xl font-bold mb-2 dark:text-white">Meeting Scheduled</h2>
            <p className="text-gray-600 dark:text-zinc-400 mb-2">
              {selectedSlot.date} at {selectedSlot.time}
            </p>
            {selectedSlot.duration && (
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                Duration: {selectedSlot.duration}
              </p>
            )}
          </div>
        ) : declined ? (
          <div className="text-center">
            <div className="text-7xl mb-4">🔄</div>
            <h2 className="text-2xl font-bold mb-2 dark:text-white">No Time Selected</h2>
            <p className="text-gray-600 dark:text-zinc-400">
              Let me find a better time that works for you
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="text-7xl mb-4">🗓️</div>
              <h2 className="text-2xl font-bold mb-2 dark:text-white">{displayTitle}</h2>
              <p className="text-gray-600 dark:text-zinc-400">Select a time that works for you</p>
            </div>

            {status === "executing" && (
              <div className="space-y-3">
                {slots.map((slot, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectSlot(slot)}
                    className="w-full px-6 py-4 rounded-xl font-medium
                      border-2 border-gray-200 dark:border-zinc-600 hover:border-blue-500 dark:hover:border-blue-400
                      shadow-sm hover:shadow-md transition-all cursor-pointer
                      flex justify-between items-center
                      hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  >
                    <div className="text-left">
                      <div className="font-bold text-gray-900 dark:text-zinc-100">{slot.date}</div>
                      <div className="text-sm text-gray-600 dark:text-zinc-400">{slot.time}</div>
                    </div>
                    {slot.duration && (
                      <div className="text-sm text-gray-500 dark:text-zinc-400">{slot.duration}</div>
                    )}
                  </button>
                ))}

                <button
                  onClick={handleDecline}
                  className="w-full px-6 py-3 rounded-xl font-medium
                    text-gray-600 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200
                    transition-all cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700"
                >
                  None of these work
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npm test -- meeting-time-picker
```
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/generative-ui/MeetingTimePicker.tsx \
        frontend/src/test/meeting-time-picker.test.tsx
git commit -m "feat(frontend): add MeetingTimePicker human-in-the-loop component"
```

---

### Task 5: Todo canvas components

**Files:**
- Create: `frontend/src/components/canvas/types.ts`
- Create: `frontend/src/components/canvas/TodoCard.tsx`
- Create: `frontend/src/components/canvas/TodoColumn.tsx`
- Create: `frontend/src/components/canvas/TodoList.tsx`
- Create: `frontend/src/components/canvas/TodoCanvas.tsx`
- Test: `frontend/src/test/todo-canvas.test.tsx`

> **Test coverage note:** `TodoList`, `TodoColumn`, and `TodoCard` are covered by tests below. `TodoCanvas.tsx` wraps `TodoList` with `useAgent()` from CopilotKit, which requires a full CopilotKit provider tree to render — mocking that in JSDOM is out of scope. `TodoCanvas` is verified in manual smoke tests.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/test/todo-canvas.test.tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { TodoList } from "@/components/canvas/TodoList"
import type { Todo } from "@/components/canvas/types"

const SAMPLE_TODOS: Todo[] = [
  {
    id: "1",
    title: "Learn CopilotKit",
    description: "Read the docs",
    emoji: "🎯",
    status: "pending",
  },
  {
    id: "2",
    title: "Build agent",
    description: "Create LangGraph agent",
    emoji: "🚀",
    status: "completed",
  },
]

describe("TodoList", () => {
  it("renders pending todos in the To Do column", () => {
    render(<TodoList todos={SAMPLE_TODOS} onUpdate={vi.fn()} isAgentRunning={false} />)
    expect(screen.getByText("Learn CopilotKit")).toBeDefined()
  })

  it("renders completed todos in the Done column", () => {
    render(<TodoList todos={SAMPLE_TODOS} onUpdate={vi.fn()} isAgentRunning={false} />)
    expect(screen.getByText("Build agent")).toBeDefined()
  })

  it("shows empty state with Add a task button when todos list is empty", () => {
    render(<TodoList todos={[]} onUpdate={vi.fn()} isAgentRunning={false} />)
    expect(screen.getByText("No tasks yet")).toBeDefined()
    expect(screen.getByRole("button", { name: /add your first todo task/i })).toBeDefined()
  })

  it("calls onUpdate with a new pending todo when Add a task is clicked", () => {
    const onUpdate = vi.fn()
    render(<TodoList todos={[]} onUpdate={onUpdate} isAgentRunning={false} />)
    fireEvent.click(screen.getByRole("button", { name: /add your first todo task/i }))
    expect(onUpdate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ title: "New Todo", status: "pending" }),
      ])
    )
  })

  it("disables the Add a task button when the agent is running", () => {
    render(<TodoList todos={[]} onUpdate={vi.fn()} isAgentRunning={true} />)
    const btn = screen.getByRole("button", { name: /add your first todo task/i })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- todo-canvas
```
Expected: FAIL

- [ ] **Step 3: Create `types.ts`**

```ts
// frontend/src/components/canvas/types.ts
export interface Todo {
  id: string
  title: string
  description: string
  emoji: string
  status: "pending" | "completed"
}
```

- [ ] **Step 4: Create `TodoCard.tsx`**

```tsx
// frontend/src/components/canvas/TodoCard.tsx
import { useState, useRef, useEffect } from "react"
import type { Todo } from "./types"

interface TodoCardProps {
  todo: Todo
  onToggleStatus: (todo: Todo) => void
  onDelete: (todo: Todo) => void
  onUpdateTitle: (todoId: string, title: string) => void
  onUpdateDescription: (todoId: string, description: string) => void
  onUpdateEmoji: (todoId: string, emoji: string) => void
}

const EMOJI_OPTIONS = ["✅", "🔥", "🎯", "💡", "🚀"]

export function TodoCard({
  todo,
  onToggleStatus,
  onDelete,
  onUpdateTitle,
  onUpdateDescription,
  onUpdateEmoji,
}: TodoCardProps) {
  const [editingField, setEditingField] = useState<"title" | "description" | null>(null)
  const [editValue, setEditValue] = useState("")
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isCompleted = todo.status === "completed"
  const truncatedDescription =
    todo.description.length > 120
      ? todo.description.slice(0, 120) + "..."
      : todo.description

  const startEdit = (field: "title" | "description") => {
    setEditingField(field)
    setEditValue(field === "title" ? todo.title : todo.description)
  }

  const saveEdit = (field: "title" | "description") => {
    if (editValue.trim()) {
      if (field === "title") onUpdateTitle(todo.id, editValue.trim())
      else onUpdateDescription(todo.id, editValue.trim())
    }
    setEditingField(null)
    setEditValue("")
  }

  const cancelEdit = () => {
    setEditingField(null)
    setEditValue("")
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px"
    }
  }, [editValue])

  return (
    <div
      className={`group relative rounded-2xl p-5 transition-all duration-150 border ${
        isCompleted
          ? "bg-neutral-100 border-neutral-200 dark:bg-neutral-800/50 dark:border-neutral-700"
          : "bg-white border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700"
      }`}
    >
      {/* Delete button — visible on hover */}
      <button
        onClick={() => onDelete(todo)}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-100 cursor-pointer rounded-full p-1 text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        aria-label="Delete todo"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Emoji avatar */}
      <div className="relative inline-block mb-3">
        <button
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`block text-3xl leading-none cursor-pointer rounded-xl p-2 transition-colors duration-100 ${
            isCompleted
              ? "bg-neutral-200 dark:bg-neutral-700"
              : "bg-neutral-100 dark:bg-neutral-700/50"
          }`}
          aria-label="Change emoji"
        >
          {todo.emoji}
        </button>
        {showEmojiPicker && (
          <div className="absolute top-0 left-full ml-2 z-10 flex gap-1 p-1.5 rounded-full bg-white border border-neutral-300 shadow-lg dark:bg-neutral-800 dark:border-neutral-600">
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onUpdateEmoji(todo.id, emoji)
                  setShowEmojiPicker(false)
                }}
                className="text-lg w-8 h-8 flex items-center justify-center rounded-full cursor-pointer transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Title + description */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggleStatus(todo)}
          className="flex-shrink-0 mt-[2px] cursor-pointer"
          aria-label={isCompleted ? "Mark as incomplete" : "Mark as complete"}
        >
          {isCompleted ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="1" y="1" width="18" height="18" rx="6" className="fill-neutral-900 dark:fill-neutral-100" />
              <path d="M6 10.5L8.5 13L14 7" className="stroke-white dark:stroke-neutral-900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="1" y="1" width="18" height="18" rx="6" className="stroke-neutral-300 dark:stroke-neutral-600" strokeWidth="1.5" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          {editingField === "title" ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => saveEdit("title")}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit("title")
                if (e.key === "Escape") cancelEdit()
              }}
              className="w-full text-[16px] font-semibold focus:outline-none bg-transparent text-neutral-900 dark:text-neutral-100 border-b-2 border-neutral-900 dark:border-neutral-100 pb-[2px]"
              autoFocus
              aria-label="Edit todo title"
            />
          ) : (
            <div
              onClick={() => startEdit("title")}
              className={`text-[16px] font-semibold cursor-text break-words leading-snug ${
                isCompleted
                  ? "text-neutral-400 line-through dark:text-neutral-500"
                  : "text-neutral-900 dark:text-neutral-100"
              }`}
            >
              {todo.title}
            </div>
          )}

          {editingField === "description" ? (
            <textarea
              ref={textareaRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => saveEdit("description")}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelEdit()
              }}
              className="w-full mt-1.5 text-[14px] leading-relaxed focus:outline-none resize-none bg-transparent text-neutral-500 dark:text-neutral-400 border-b-2 border-neutral-900 dark:border-neutral-100 pb-[2px]"
              rows={1}
              autoFocus
              aria-label="Edit todo description"
            />
          ) : (
            <p
              onClick={() => startEdit("description")}
              className={`mt-1.5 text-[14px] leading-relaxed cursor-text ${
                isCompleted
                  ? "text-neutral-300 line-through dark:text-neutral-600"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {truncatedDescription}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `TodoColumn.tsx`**

```tsx
// frontend/src/components/canvas/TodoColumn.tsx
import type { Todo } from "./types"
import { TodoCard } from "./TodoCard"

interface TodoColumnProps {
  title: string
  todos: Todo[]
  emptyMessage: string
  showAddButton?: boolean
  onAddTodo?: () => void
  onToggleStatus: (todo: Todo) => void
  onDelete: (todo: Todo) => void
  onUpdateTitle: (todoId: string, title: string) => void
  onUpdateDescription: (todoId: string, description: string) => void
  onUpdateEmoji: (todoId: string, emoji: string) => void
  isAgentRunning: boolean
}

export function TodoColumn({
  title,
  todos,
  emptyMessage,
  showAddButton = false,
  onAddTodo,
  onToggleStatus,
  onDelete,
  onUpdateTitle,
  onUpdateDescription,
  onUpdateEmoji,
  isAgentRunning,
}: TodoColumnProps) {
  return (
    <section aria-label={`${title} column`} className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-[18px] font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            {title}
          </h2>
          <span className="text-[12px] font-semibold rounded-full px-2 py-0.5 text-neutral-500 bg-neutral-200 dark:text-neutral-400 dark:bg-neutral-700">
            {todos.length}
          </span>
        </div>
        {showAddButton && onAddTodo && (
          <button
            onClick={onAddTodo}
            className="rounded-full cursor-pointer transition-colors p-1.5 text-neutral-500 bg-neutral-200 hover:bg-neutral-300 hover:text-neutral-900 dark:text-neutral-400 dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:hover:text-neutral-100"
            aria-label="Add new todo"
            disabled={isAgentRunning}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>

      <div className="space-y-4">
        {todos.length === 0 ? (
          <div className="text-center text-[14px] rounded-2xl border-2 border-dashed p-5 min-h-[151px] flex items-center justify-center text-neutral-400 border-neutral-300 dark:text-neutral-500 dark:border-neutral-700">
            {emptyMessage}
          </div>
        ) : (
          todos.map((todo) => (
            <TodoCard
              key={todo.id}
              todo={todo}
              onToggleStatus={onToggleStatus}
              onDelete={onDelete}
              onUpdateTitle={onUpdateTitle}
              onUpdateDescription={onUpdateDescription}
              onUpdateEmoji={onUpdateEmoji}
            />
          ))
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Create `TodoList.tsx`**

```tsx
// frontend/src/components/canvas/TodoList.tsx
import type { Todo } from "./types"
import { TodoColumn } from "./TodoColumn"

interface TodoListProps {
  todos: Todo[]
  onUpdate: (todos: Todo[]) => void
  isAgentRunning: boolean
}

export function TodoList({ todos, onUpdate, isAgentRunning }: TodoListProps) {
  const pendingTodos = todos.filter((t) => t.status === "pending")
  const completedTodos = todos.filter((t) => t.status === "completed")

  const toggleStatus = (todo: Todo) => {
    onUpdate(
      todos.map((t) =>
        t.id === todo.id
          ? {
              ...t,
              status: (t.status === "completed" ? "pending" : "completed") as
                | "pending"
                | "completed",
            }
          : t
      )
    )
  }

  const deleteTodo = (todo: Todo) => {
    onUpdate(todos.filter((t) => t.id !== todo.id))
  }

  const updateTitle = (todoId: string, title: string) => {
    onUpdate(todos.map((t) => (t.id === todoId ? { ...t, title } : t)))
  }

  const updateDescription = (todoId: string, description: string) => {
    onUpdate(todos.map((t) => (t.id === todoId ? { ...t, description } : t)))
  }

  const updateEmoji = (todoId: string, emoji: string) => {
    onUpdate(todos.map((t) => (t.id === todoId ? { ...t, emoji } : t)))
  }

  const addTodo = () => {
    const newTodo: Todo = {
      id: crypto.randomUUID(),
      title: "New Todo",
      description: "Add a description",
      emoji: "🎯",
      status: "pending",
    }
    onUpdate([...todos, newTodo])
  }

  if (!todos || todos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-5xl">✏️</div>
        <p className="text-[16px] font-semibold text-neutral-900 dark:text-neutral-100">
          No tasks yet
        </p>
        <p className="text-[14px] text-neutral-500 dark:text-neutral-400">
          Create your first task to get started
        </p>
        <button
          onClick={addTodo}
          className="mt-2 px-5 py-2.5 text-[14px] font-semibold rounded-full cursor-pointer transition-colors text-white bg-neutral-900 hover:bg-neutral-700 dark:text-neutral-900 dark:bg-neutral-100 dark:hover:bg-neutral-300"
          aria-label="Add your first todo task"
          disabled={isAgentRunning}
        >
          Add a task
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-8 h-full">
      <TodoColumn
        title="To Do"
        todos={pendingTodos}
        emptyMessage="No pending tasks"
        showAddButton
        onAddTodo={addTodo}
        onToggleStatus={toggleStatus}
        onDelete={deleteTodo}
        onUpdateTitle={updateTitle}
        onUpdateDescription={updateDescription}
        onUpdateEmoji={updateEmoji}
        isAgentRunning={isAgentRunning}
      />
      <TodoColumn
        title="Done"
        todos={completedTodos}
        emptyMessage="No completed tasks yet"
        onToggleStatus={toggleStatus}
        onDelete={deleteTodo}
        onUpdateTitle={updateTitle}
        onUpdateDescription={updateDescription}
        onUpdateEmoji={updateEmoji}
        isAgentRunning={isAgentRunning}
      />
    </div>
  )
}
```

- [ ] **Step 7: Create `TodoCanvas.tsx`**

```tsx
// frontend/src/components/canvas/TodoCanvas.tsx
// The canvas is always visible alongside the chat pane (spec: "render chat plus a
// todo canvas in the same page shell"). It shows an empty state when there are no
// todos, and fills in as the agent or user adds items.
import { useAgent } from "@copilotkit/react-core/v2"
import { TodoList } from "./TodoList"

export function TodoCanvas() {
  const { agent } = useAgent()

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-neutral-950 [background-image:radial-gradient(circle,#d5d5d5_1px,transparent_1px)] dark:[background-image:radial-gradient(circle,#333_1px,transparent_1px)] [background-size:20px_20px]">
      <div className="max-w-4xl mx-auto px-8 py-10 h-full">
        <TodoList
          todos={agent.state?.todos || []}
          onUpdate={(updatedTodos) => agent.setState({ todos: updatedTodos })}
          isAgentRunning={agent.isRunning}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd frontend && npm test -- todo-canvas
```
Expected: 5 tests PASS

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/canvas/ frontend/src/test/todo-canvas.test.tsx
git commit -m "feat(frontend): add todo canvas components (TodoCard, TodoColumn, TodoList, TodoCanvas)"
```

---

## Chunk 2: Frontend Hook Integration

### Task 6: `useCopilotExamples` hook

Replaces `useGenerativeUi.ts`. The smoke test also covers the `useTheme` and `ToolReasoning` imports that did not have their own TDD steps.

**Files:**
- Create: `frontend/src/hooks/useCopilotExamples.tsx`
- Test: `frontend/src/test/copilot-examples.test.tsx`

> **Note:** Do NOT delete `useGenerativeUi.ts` yet — it is still imported in `CopilotChatInterface.tsx` until Task 8 replaces that file. Deleting it here would break the build between commits.

- [ ] **Step 1: Write the failing smoke test**

```tsx
// frontend/src/test/copilot-examples.test.tsx
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { resolve } from "path"

const hook = readFileSync(
  resolve(__dirname, "../hooks/useCopilotExamples.tsx"),
  "utf-8"
)

describe("useCopilotExamples — registration smoke test", () => {
  it("imports useTheme", () => {
    expect(hook).toContain("useTheme")
  })

  it("registers pieChart via useComponent", () => {
    expect(hook).toContain('name: "pieChart"')
    expect(hook).toContain("useComponent")
  })

  it("registers barChart via useComponent", () => {
    expect(hook).toContain('name: "barChart"')
  })

  it("registers toggleTheme via useFrontendTool", () => {
    expect(hook).toContain('name: "toggleTheme"')
    expect(hook).toContain("useFrontendTool")
  })

  it("registers default tool renderer via useDefaultRenderTool with ToolReasoning", () => {
    expect(hook).toContain("useDefaultRenderTool")
    expect(hook).toContain("ToolReasoning")
  })

  it("registers scheduleTime via useHumanInTheLoop with MeetingTimePicker", () => {
    expect(hook).toContain('name: "scheduleTime"')
    expect(hook).toContain("useHumanInTheLoop")
    expect(hook).toContain("MeetingTimePicker")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- copilot-examples
```
Expected: FAIL — "ENOENT: no such file or directory"

- [ ] **Step 3: Create `useCopilotExamples.tsx`**

```tsx
// frontend/src/hooks/useCopilotExamples.tsx
import { z } from "zod"
import {
  useComponent,
  useFrontendTool,
  useHumanInTheLoop,
  useDefaultRenderTool,
} from "@copilotkit/react-core/v2"
import { PieChart, PieChartPropsSchema } from "@/components/generative-ui/PieChart"
import { BarChart, BarChartPropsSchema } from "@/components/generative-ui/BarChart"
import { ToolReasoning } from "@/components/generative-ui/ToolReasoning"
import { MeetingTimePicker } from "@/components/generative-ui/MeetingTimePicker"
import { useTheme } from "@/hooks/useTheme"

export const useCopilotExamples = () => {
  const { theme, setTheme } = useTheme()

  // Frontend tool: toggle light/dark mode
  useFrontendTool(
    {
      name: "toggleTheme",
      description: "Frontend tool for toggling the theme of the app.",
      parameters: z.object({}),
      handler: async () => {
        setTheme(theme === "dark" ? "light" : "dark")
      },
    },
    [theme, setTheme]
  )

  // Controlled Generative UI: pie chart
  useComponent({
    name: "pieChart",
    description: "Controlled Generative UI that displays data as a pie chart.",
    parameters: PieChartPropsSchema,
    render: PieChart,
  })

  // Controlled Generative UI: bar chart
  useComponent({
    name: "barChart",
    description: "Controlled Generative UI that displays data as a bar chart.",
    parameters: BarChartPropsSchema,
    render: BarChart,
  })

  // Default renderer for all backend tool calls
  useDefaultRenderTool({
    render: ({ name, status, parameters }) => (
      <ToolReasoning name={name} status={status} args={parameters} />
    ),
  })

  // Human-in-the-loop: meeting scheduler
  useHumanInTheLoop({
    name: "scheduleTime",
    description: "Use human-in-the-loop to schedule a meeting with the user.",
    parameters: z.object({
      reasonForScheduling: z
        .string()
        .describe("Reason for scheduling, very brief - 5 words."),
      meetingDuration: z.number().describe("Duration of the meeting in minutes"),
    }),
    render: ({ respond, status, args }) => (
      <MeetingTimePicker status={status} respond={respond} {...args} />
    ),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npm test -- copilot-examples
```
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useCopilotExamples.tsx \
        frontend/src/test/copilot-examples.test.tsx
git commit -m "feat(frontend): add useCopilotExamples hook consolidating all CopilotKit registrations"
```

---

### Task 7: Update example suggestions

**Files:**
- Modify: `frontend/src/hooks/useExampleSuggestions.ts`

- [ ] **Step 1: Replace file contents**

```ts
// frontend/src/hooks/useExampleSuggestions.ts
import { useConfigureSuggestions } from "@copilotkit/react-core/v2"

export const useExampleSuggestions = () => {
  useConfigureSuggestions({
    suggestions: [
      {
        title: "Pie chart (Controlled Generative UI)",
        message:
          "Please show me the distribution of our revenue by category in a pie chart.",
      },
      {
        title: "Bar chart (Controlled Generative UI)",
        message:
          "Please show me the distribution of our expenses by category in a bar chart.",
      },
      {
        title: "Change theme (Frontend Tools)",
        message: "Switch the app to dark mode.",
      },
      {
        title: "Scheduling (Human In The Loop)",
        message: "Please schedule a meeting with me to learn about CopilotKit.",
      },
      {
        title: "Canvas (Shared State)",
        message:
          "Please demonstrate shared state, open the canvas, and then add some todos to it about learning about CopilotKit.",
      },
    ],
    available: "always",
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useExampleSuggestions.ts
git commit -m "feat(frontend): expand example suggestions to cover all CopilotKit examples"
```

---

### Task 8: Update `CopilotChatInterface` and remove `useGenerativeUi.ts`

This is the final wiring step. It replaces `CopilotChatInterface.tsx` (switching to `useCopilotExamples`, adding `ThemeProvider` and the canvas pane) and then deletes the now-unused `useGenerativeUi.ts`.

**Files:**
- Modify: `frontend/src/components/chat/CopilotChatInterface.tsx`
- Delete: `frontend/src/hooks/useGenerativeUi.ts`

- [ ] **Step 1: Replace `CopilotChatInterface.tsx`**

```tsx
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
```

- [ ] **Step 2: Delete `useGenerativeUi.ts`**

```bash
git rm frontend/src/hooks/useGenerativeUi.ts
```

- [ ] **Step 3: Run full frontend test suite**

```bash
cd frontend && npm test
```
Expected: All tests PASS.

> **If `components.test.tsx` fails:** Read the error. The existing string-match tests in `components.test.tsx` check for `<ChatInterface />` and its imports in `ChatPage.tsx` — those still exist and are unchanged. The only change to `CopilotChatInterface.tsx` is internal wiring; `ChatPage.tsx` is not modified. If any test fails it will be due to a compile error from a stale import — check that `useGenerativeUi.ts` is fully removed and no other file imports it.

- [ ] **Step 4: Commit**

> **Note:** `git rm` (Step 2) already staged the deletion of `useGenerativeUi.ts`. The commit below only needs to stage the updated `CopilotChatInterface.tsx` — the deletion is already in the index.

```bash
git add frontend/src/components/chat/CopilotChatInterface.tsx
git commit -m "feat(frontend): wire ThemeProvider, useCopilotExamples, and TodoCanvas into CopilotChatInterface"
```

---

## Chunk 3: Backend Tools

### Task 9: `query_data` tool and sample data

**Files:**
- Create: `patterns/langgraph-single-agent/tools/db.csv`
- Create: `patterns/langgraph-single-agent/tools/query_data.py`
- Modify: `patterns/langgraph-single-agent/tools/__init__.py` (full replace — current file is empty)
- Create: `tests/conftest.py` addition for sys.path
- Create: `tests/unit/test_tools.py`

> **Import path note:** `patterns/langgraph-single-agent/` contains a hyphen so it cannot be imported as a Python package name. Tests add the agent directory to `sys.path` via `conftest.py`, then import directly from `tools.*`.

- [ ] **Step 1: Add sys.path setup to `tests/conftest.py`**

Append to the existing `tests/conftest.py` (which currently only has a docstring):

```python
import sys
from pathlib import Path

# Allow tests to import directly from the langgraph agent's tools package.
# The directory name contains a hyphen and cannot be used as a Python import name,
# so we add it to sys.path and import from tools.* directly.
sys.path.insert(0, str(Path(__file__).parent.parent / "patterns" / "langgraph-single-agent"))
```

- [ ] **Step 2: Write the failing test**

```python
# tests/unit/test_tools.py
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
import pytest
from pathlib import Path


def test_query_data_returns_list():
    """query_data.invoke returns the cached CSV rows as a list of dicts."""
    from tools.query_data import query_data
    result = query_data.invoke({"query": "show all data"})
    assert isinstance(result, list)
    assert len(result) > 0
    assert isinstance(result[0], dict)


def test_query_data_rows_have_expected_columns():
    """Each CSV row has the required financial data columns."""
    from tools.query_data import query_data
    result = query_data.invoke({"query": "all"})
    row = result[0]
    for col in ("date", "category", "amount", "type"):
        assert col in row, f"Missing column: {col}"


def test_db_csv_exists():
    """db.csv must be present alongside query_data.py."""
    # Use an anchored path relative to this test file so the test is portable
    # regardless of the working directory pytest is invoked from.
    csv_path = Path(__file__).parent.parent.parent / "patterns" / "langgraph-single-agent" / "tools" / "db.csv"
    assert csv_path.exists(), f"db.csv must exist at {csv_path}"
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
python -m pytest tests/unit/test_tools.py::test_query_data_returns_list -v
```
Expected: FAIL — ImportError or ModuleNotFoundError

- [ ] **Step 4: Create `db.csv`**

Create the file at `patterns/langgraph-single-agent/tools/db.csv` with this content (sample financial data used for chart demonstrations):

```csv
date,category,subcategory,amount,type,notes
2026-01-05,Revenue,Enterprise Subscriptions,45000,income,3 new enterprise customers (Acme Corp, TechFlow, DataViz Inc)
2026-01-05,Revenue,Pro Tier Upgrades,12000,income,24 users upgraded from free to pro
2026-01-08,Revenue,API Usage Overages,3500,income,High API usage from top 5 customers
2026-01-10,Expenses,Engineering Salaries,42000,expense,7 engineers + 2 contractors
2026-01-10,Expenses,Product Team,18000,expense,PM and 2 designers
2026-01-12,Expenses,AWS Infrastructure,8200,expense,Increased compute for new AI features
2026-01-15,Expenses,Marketing - Paid Ads,12000,expense,Google Ads and LinkedIn campaigns
2026-01-18,Revenue,Consulting Services,8500,income,Custom integration for Acme Corp
2026-01-20,Expenses,Customer Success,15000,expense,3 CSMs + support tools (Intercom)
2026-01-22,Expenses,AI Model Costs,4200,expense,OpenAI API usage for product features
2026-01-25,Revenue,Marketplace Sales,6800,income,Template and plugin sales
2026-01-28,Expenses,Office & Equipment,3500,expense,New laptops and coworking spaces
2026-02-03,Revenue,Enterprise Subscriptions,51000,income,2 new customers + expansion from TechFlow
2026-02-03,Revenue,Pro Tier Upgrades,15500,income,31 upgrades + reduced churn
2026-02-05,Revenue,API Usage Overages,4800,income,DataViz Inc heavy API usage spike
2026-02-07,Expenses,Engineering Salaries,42000,expense,Same headcount as January
2026-02-07,Expenses,Product Team,18000,expense,No changes to product team
2026-02-10,Expenses,AWS Infrastructure,9500,expense,Traffic spike from viral social post
2026-02-12,Expenses,Marketing - Paid Ads,15000,expense,Increased ad spend for Q1 push
2026-02-14,Revenue,Consulting Services,12000,income,2 custom projects (TechFlow + new client)
2026-02-18,Expenses,Customer Success,16500,expense,Hired 1 additional CSM
2026-02-20,Expenses,AI Model Costs,5800,expense,Increased usage from new AI features launch
2026-02-22,Revenue,Marketplace Sales,8200,income,Top template hit featured list
2026-02-25,Expenses,Conference & Travel,4500,expense,Team attended SaaS Conference 2026
2026-02-27,Revenue,Partnership Revenue,5500,income,Referral fees from integration partners
2026-03-02,Revenue,Enterprise Subscriptions,58000,income,Major win: Fortune 500 customer signed
2026-03-02,Revenue,Pro Tier Upgrades,19000,income,42 upgrades - best month yet
2026-03-05,Revenue,API Usage Overages,6200,income,Consistent high usage across top tier
2026-03-08,Expenses,Engineering Salaries,48000,expense,Hired 1 senior engineer for AI team
2026-03-08,Expenses,Product Team,21000,expense,Promoted designer to senior level
2026-03-10,Expenses,AWS Infrastructure,11000,expense,Scaled infrastructure for enterprise client
2026-03-12,Expenses,Marketing - Paid Ads,18000,expense,Doubled down on successful campaigns
2026-03-14,Revenue,Consulting Services,15500,income,Fortune 500 onboarding + 2 other projects
2026-03-16,Expenses,Customer Success,19500,expense,Hired dedicated enterprise CSM
2026-03-18,Expenses,AI Model Costs,7200,expense,Fortune 500 client heavy AI usage
2026-03-20,Revenue,Marketplace Sales,9800,income,3 new templates in top 10
2026-03-22,Expenses,Sales & BD,12000,expense,Hired first sales rep for enterprise
2026-03-24,Revenue,Partnership Revenue,8200,income,New integration partnerships launched
2026-03-26,Expenses,Security & Compliance,6500,expense,SOC 2 audit and security tools
2026-03-28,Revenue,Training & Workshops,4200,income,Conducted 2 customer training sessions
```

- [ ] **Step 5: Create `query_data.py`**

```python
# patterns/langgraph-single-agent/tools/query_data.py
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import csv
from pathlib import Path

from langchain.tools import tool

# Read at module load time — avoids file I/O on every tool invocation.
_csv_path = Path(__file__).parent / "db.csv"
with open(_csv_path) as _f:
    _cached_data = list(csv.DictReader(_f))


@tool
def query_data(query: str) -> list[dict]:
    """
    Query the database. Accepts natural language.
    Always call this tool before displaying a chart or graph.
    """
    return _cached_data
```

- [ ] **Step 6: Replace `tools/__init__.py`**

The current file is empty. Replace it entirely:

```python
# patterns/langgraph-single-agent/tools/__init__.py
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from .query_data import query_data

__all__ = ["query_data"]
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
python -m pytest tests/unit/test_tools.py -k "query_data or db_csv" -v
```
Expected: 3 tests PASS

- [ ] **Step 8: Commit**

```bash
git add patterns/langgraph-single-agent/tools/db.csv \
        patterns/langgraph-single-agent/tools/query_data.py \
        patterns/langgraph-single-agent/tools/__init__.py \
        tests/conftest.py \
        tests/unit/test_tools.py
git commit -m "feat(agent): add query_data tool, sample financial CSV, and unit test infrastructure"
```

---

### Task 10: `todos.py` — state schema and todo tools

**Files:**
- Create: `patterns/langgraph-single-agent/tools/todos.py`
- Modify: `patterns/langgraph-single-agent/tools/__init__.py` (second full replace — adds todo exports)
- Test: `tests/unit/test_tools.py` (append todo tests)

- [ ] **Step 1: Write the failing tests** (append to existing `tests/unit/test_tools.py`)

```python
# Append to tests/unit/test_tools.py

def test_todo_typed_dict_has_required_fields():
    """Todo TypedDict must declare all required keys."""
    from tools.todos import Todo
    todo: Todo = {
        "id": "abc-123",
        "title": "Test task",
        "description": "A test todo",
        "emoji": "🎯",
        "status": "pending",
    }
    assert todo["id"] == "abc-123"
    assert todo["status"] == "pending"


def test_agent_state_declares_todos_annotation():
    """AgentState must extend BaseAgentState and annotate a 'todos' field."""
    from tools.todos import AgentState
    assert "todos" in AgentState.__annotations__


def test_assign_ids_fills_missing_ids():
    """_assign_ids assigns a non-empty uuid to any todo with a missing or empty id."""
    from tools.todos import _assign_ids
    todos = [
        {"id": "", "title": "x", "description": "", "emoji": "🎯", "status": "pending"},
        {"id": "existing-id", "title": "y", "description": "", "emoji": "🎯", "status": "pending"},
    ]
    result = _assign_ids(todos)
    assert result[0]["id"] != ""
    assert result[1]["id"] == "existing-id"  # existing IDs are preserved


def test_todo_tools_exported_with_correct_names():
    """todo_tools must be a list of exactly two tools: manage_todos and get_todos."""
    from tools.todos import todo_tools
    assert len(todo_tools) == 2
    names = {t.name for t in todo_tools}
    assert "manage_todos" in names
    assert "get_todos" in names
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/unit/test_tools.py -k "todo" -v
```
Expected: FAIL — ImportError

- [ ] **Step 3: Create `todos.py`**

`_assign_ids` is extracted as a module-level helper so it can be tested independently of the `@tool` decorator's dependency injection machinery.

```python
# patterns/langgraph-single-agent/tools/todos.py
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import uuid
from typing import Literal, TypedDict

from langchain.agents import AgentState as BaseAgentState
from langchain.tools import ToolRuntime, tool
from langchain_core.messages import ToolMessage
from langgraph.types import Command

# ToolRuntime is confirmed available at langchain.tools (langchain >= 1.2).
# If you see an ImportError, verify your langchain version is >= 0.3.


class Todo(TypedDict):
    id: str
    title: str
    description: str
    emoji: str
    status: Literal["pending", "completed"]


class AgentState(BaseAgentState):
    todos: list[Todo]


def _assign_ids(todos: list[dict]) -> list[dict]:
    """Assign a uuid4 to any todo that has a missing or empty 'id'."""
    for todo in todos:
        if not todo.get("id"):
            todo["id"] = str(uuid.uuid4())
    return todos


@tool
def manage_todos(todos: list[Todo], runtime: ToolRuntime) -> Command:
    """
    Manage the current todos. Replaces the entire todo list.
    Assigns a unique UUID to any todo that is missing one.
    """
    _assign_ids(todos)  # type: ignore[arg-type]

    return Command(
        update={
            "todos": todos,
            "messages": [
                ToolMessage(
                    content="Successfully updated todos",
                    tool_call_id=runtime.tool_call_id,
                )
            ],
        }
    )


@tool
def get_todos(runtime: ToolRuntime) -> list[Todo]:
    """
    Get the current todo list from agent state.
    """
    return runtime.state.get("todos", [])


todo_tools = [manage_todos, get_todos]
```

- [ ] **Step 4: Replace `tools/__init__.py`**

```python
# patterns/langgraph-single-agent/tools/__init__.py
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from .query_data import query_data
from .todos import AgentState, todo_tools

__all__ = ["query_data", "AgentState", "todo_tools"]
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
python -m pytest tests/unit/test_tools.py -v
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add patterns/langgraph-single-agent/tools/todos.py \
        patterns/langgraph-single-agent/tools/__init__.py \
        tests/unit/test_tools.py
git commit -m "feat(agent): add AgentState with todos field, manage_todos and get_todos tools"
```

---

### Task 11: Update `langgraph_agent.py`

Add the new tools and `AgentState` to the LangGraph single-agent pattern.

**Files:**
- Modify: `patterns/langgraph-single-agent/langgraph_agent.py`

- [ ] **Step 1: Read the current file**

```bash
cat patterns/langgraph-single-agent/langgraph_agent.py
```

Confirm the current import block and the `create_langgraph_agent` function signature.

- [ ] **Step 2: Add tool imports**

In the existing imports block, add after the last import line:

```python
from tools import query_data, AgentState, todo_tools
```

> **Import style:** The file runs as `python langgraph_agent.py` from the `patterns/langgraph-single-agent/` directory, so `from tools import ...` resolves the sibling `tools/` package. Match whatever import style the file already uses (relative or absolute).

- [ ] **Step 3: Update `SYSTEM_PROMPT`**

Replace the existing `SYSTEM_PROMPT` constant with:

```python
SYSTEM_PROMPT = """You are a helpful assistant with access to tools via the Gateway and built-in data tools.

When demonstrating charts, always call the query_data tool first to fetch data from the database before calling any chart tool.
When managing todos, use manage_todos to update the list and get_todos to read the current list.
When asked about your tools, list them and explain what they do."""
```

- [ ] **Step 4: Update `create_langgraph_agent`**

Find the `create_agent(...)` call inside `create_langgraph_agent` and update it:

```python
async def create_langgraph_agent(tools: list):
    try:
        return create_agent(
            model=_build_model(streaming=True),
            tools=[*tools, query_data, *todo_tools],  # MCP tools + data + todo tools
            checkpointer=_build_checkpointer(),
            middleware=[CopilotKitMiddleware()],
            system_prompt=SYSTEM_PROMPT,
            state_schema=AgentState,  # extends BaseAgentState with todos: list[Todo]
        )
    except Exception as error:
        print(f"[AGENT ERROR] Error creating LangGraph agent: {error}")
        print(f"[AGENT ERROR] Exception type: {type(error).__name__}")
        traceback.print_exc()
        raise
```

- [ ] **Step 5: Commit**

```bash
git add patterns/langgraph-single-agent/langgraph_agent.py
git commit -m "feat(agent): extend langgraph agent with query_data, todo tools, and AgentState"
```

---

## Final Verification

- [ ] **Run full frontend test suite**

```bash
cd frontend && npm test
```
Expected: All tests PASS

- [ ] **Run full backend test suite**

```bash
python -m pytest tests/ -v
```
Expected: All tests PASS

- [ ] **Manual smoke tests** (requires a deployed or locally running agent):
  1. "Please show me the distribution of our revenue by category in a pie chart." → `query_data` fires, then pie chart renders in chat
  2. "Please show me the distribution of our expenses by category in a bar chart." → bar chart renders
  3. "Switch the app to dark mode." → `toggleTheme` fires, UI switches
  4. "Please schedule a meeting with me to learn about CopilotKit." → `scheduleTime` fires, `MeetingTimePicker` appears with time slots
  5. "Add some todos about learning CopilotKit." → todos appear in the right-side canvas (agent calls `manage_todos`)
  6. Standard FAST chat flow (`ChatInterface` path) unchanged — switch `USE_COPILOTKIT_CHAT = false` in `ChatPage.tsx` to verify
