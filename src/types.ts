export type HomeworkStatus = 'todo' | 'doing' | 'done'

export interface HomeworkItem {
  id: string
  /** 归属日期，格式 YYYY-MM-DD */
  date: string
  subject: string
  title: string
  status: HomeworkStatus
  /** 预计用时（分钟） */
  estimatedMinutes?: number
  /** 实际用时（分钟） */
  actualMinutes?: number
  note?: string
  createdAt: number
  updatedAt: number
}

/** 一次工具调用的记录，用于在对话里展示 Agent 的执行过程 */
export interface ToolTraceItem {
  id: string
  name: string
  args: Record<string, unknown>
  ok: boolean
  /** 中文结果摘要，直接展示给用户 */
  summary: string
  /** 结构化结果，回传给模型 */
  data?: unknown
}

export type AgentMode = 'llm' | 'none' | 'manual'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  trace?: ToolTraceItem[]
  mode?: AgentMode
  tone?: 'normal' | 'error'
}

export interface AgentRunResult {
  reply: string
  trace: ToolTraceItem[]
  mode: AgentMode
  tone?: 'normal' | 'error'
}
