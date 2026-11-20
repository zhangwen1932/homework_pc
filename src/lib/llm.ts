export interface LlmStatus {
  configured: boolean
  model: string
  baseUrl: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface LlmReply {
  content: string
  toolCalls: ToolCall[]
}

interface LlmChatPayload {
  ok?: boolean
  reason?: string
  message?: string
  error?: { message?: string }
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: ToolCall[]
    }
  }>
}

let cachedStatus: LlmStatus | undefined

/** 读取服务端代理的模型配置状态；没有代理（如静态部署）时返回未配置 */
export async function getLlmStatus(force = false): Promise<LlmStatus> {
  if (cachedStatus && !force) return cachedStatus
  try {
    const res = await fetch('/api/llm/status')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const payload = (await res.json()) as { configured?: boolean; model?: string; baseUrl?: string }
    cachedStatus = {
      configured: Boolean(payload.configured),
      model: payload.model ?? '',
      baseUrl: payload.baseUrl ?? '',
    }
  } catch {
    cachedStatus = { configured: false, model: '', baseUrl: '' }
  }
  return cachedStatus
}

/** 一次带工具定义的对话请求，由 Vite 开发服务器代理到真实模型 */
export async function chatWithTools(messages: LlmMessage[], tools: unknown[]): Promise<LlmReply> {
  const res = await fetch('/api/llm/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, tools, tool_choice: 'auto', temperature: 0.2 }),
  })

  let payload: LlmChatPayload | undefined
  try {
    payload = (await res.json()) as LlmChatPayload
  } catch {
    payload = undefined
  }

  if (!payload) throw new Error(`模型服务返回了非 JSON 内容（HTTP ${res.status}）`)
  if (payload.ok === false) throw new Error(payload.message || `模型服务不可用（${payload.reason ?? res.status}）`)
  if (payload.error) throw new Error(payload.error.message || '模型返回错误')

  const message = payload.choices?.[0]?.message
  if (!message) throw new Error('模型返回内容为空')

  return {
    content: typeof message.content === 'string' ? message.content : '',
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
  }
}
