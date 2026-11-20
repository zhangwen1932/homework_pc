import type { AgentRunResult, ToolTraceItem } from '../types'
import { formatDateLabel } from './date'
import { chatWithTools, getLlmStatus, type LlmMessage } from './llm'
import { executeTool, toolSchemas, type ToolContext } from './tools'

const MAX_ROUNDS = 6

function systemPrompt(ctx: ToolContext): string {
  return [
    '你是「作业小管家」，一个帮家长记录孩子作业的 AI Agent。',
    '',
    `当前日期：${ctx.date}（${formatDateLabel(ctx.date)}）`,
    '',
    '工作规则：',
    '1. 用户用自然语言描述作业情况时，先决定要调用哪些工具，然后调用工具，不要凭空编造作业内容。',
    '2. 不确定存在哪些作业时，先用 list_homework 查询当天清单，再决定是更新还是新增。',
    '3. 日期默认使用"当前日期"，只有用户明确说"明天/昨天/后天"等才换算成对应日期。',
    '4. 一句话里包含多件事时，可以一次调用多个工具，例如同时把数学标记完成、新增语文作文。',
    '5. 工具执行完后，用简洁自然的中文汇报做了什么，并说明当天还剩几项作业；不要复述 JSON，也不要输出工具名。',
    '6. 与记录作业无关的问题，礼貌地把话题拉回来，并给一句示例说法。',
  ].join('\n')
}

async function runLlmAgent(input: string, ctx: ToolContext): Promise<AgentRunResult> {
  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt(ctx) },
    { role: 'user', content: input },
  ]
  const trace: ToolTraceItem[] = []
  let lastContent = ''

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const reply = await chatWithTools(messages, toolSchemas)
    lastContent = reply.content || lastContent

    if (!reply.toolCalls.length) {
      return { reply: reply.content.trim() || lastContent || '处理完成。', trace, mode: 'llm' }
    }

    messages.push({ role: 'assistant', content: reply.content || null, tool_calls: reply.toolCalls })

    for (const call of reply.toolCalls) {
      let args: unknown = {}
      try {
        args = JSON.parse(call.function.arguments || '{}')
      } catch {
        args = {}
      }
      const item = await executeTool(call.function.name, args, ctx)
      trace.push(item)
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify({ ok: item.ok, summary: item.summary, data: item.data }),
      })
    }
  }

  return { reply: lastContent || '已经帮你更新完了。', trace, mode: 'llm' }
}

/** 必须配置 API Key 才能使用 AI Agent；未配置或调用失败时直接给出提示，不再降级本地模拟 */
export async function runAgent(input: string, ctx: ToolContext): Promise<AgentRunResult> {
  const status = await getLlmStatus()

  if (!status.configured) {
    return {
      reply:
        '当前未配置模型 API Key，AI 对话暂不可用。\n请打开右上角「管理后台」，在「模型配置」里填写 API Key 并保存，然后回到这里重新发送。',
      trace: [],
      mode: 'none',
    }
  }

  try {
    return await runLlmAgent(input, ctx)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      reply: `模型调用失败：${reason}\n请检查管理后台中的模型配置（API Key / 接口地址 / 模型名称）后重试。`,
      trace: [],
      mode: 'llm',
      tone: 'error',
    }
  }
}
