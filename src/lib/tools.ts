import type { HomeworkItem, HomeworkStatus, ToolTraceItem } from '../types'
import { humanizeMinutes } from './date'
import { homeworkStore, uid } from './store'

export interface ToolContext {
  /** UI 当前查看的日期，作为未显式指定日期时的默认值 */
  date: string
}

export const STATUS_LABELS: Record<HomeworkStatus, string> = {
  todo: '未开始',
  doing: '进行中',
  done: '已完成',
}

const STATUS_ALIASES: Record<string, HomeworkStatus> = {
  todo: 'todo',
  pending: 'todo',
  '未开始': 'todo',
  '未完成': 'todo',
  doing: 'doing',
  in_progress: 'doing',
  '进行中': 'doing',
  done: 'done',
  finished: 'done',
  '已完成': 'done',
}

const SUBJECT_ALIASES: Record<string, string> = {
  '语': '语文',
  '数': '数学',
  '英': '英语',
  '道法': '道德与法治',
  '政治': '道德与法治',
  '信息': '信息技术',
  '信技': '信息技术',
}

export function normalizeStatus(value: unknown): HomeworkStatus | undefined {
  if (typeof value !== 'string') return undefined
  return STATUS_ALIASES[value.trim().toLowerCase()]
}

export function normalizeSubject(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().replace(/(作业|功课|课)$/, '')
  if (!trimmed) return undefined
  return SUBJECT_ALIASES[trimmed] ?? trimmed
}

export function statusLabel(status: HomeworkStatus): string {
  return STATUS_LABELS[status]
}

export interface DailySummary {
  date: string
  total: number
  done: number
  doing: number
  todo: number
  doneRate: number
  actualMinutes: number
  pending: Array<{ id: string; subject: string; title: string; status: HomeworkStatus }>
}

export function buildDailySummary(date: string): DailySummary {
  const items = homeworkStore.getByDate(date)
  const done = items.filter((item) => item.status === 'done').length
  const doing = items.filter((item) => item.status === 'doing').length
  const todo = items.length - done - doing
  return {
    date,
    total: items.length,
    done,
    doing,
    todo,
    doneRate: items.length ? Math.round((done / items.length) * 100) : 0,
    actualMinutes: items.reduce((sum, item) => sum + (item.actualMinutes ?? 0), 0),
    pending: items
      .filter((item) => item.status !== 'done')
      .map((item) => ({ id: item.id, subject: item.subject, title: item.title, status: item.status })),
  }
}

function describe(item: HomeworkItem): string {
  return `「${item.subject} · ${item.title}」`
}

function makeTrace(
  name: string,
  args: Record<string, unknown>,
  ok: boolean,
  summary: string,
  data?: unknown,
): ToolTraceItem {
  return { id: uid('trace'), name, args, ok, summary, data }
}

function resolveDate(value: unknown, ctx: ToolContext): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim()
  return ctx.date
}

/** 按 id / 学科 / 标题匹配目标作业，都不传则匹配当天全部 */
function matchItems(items: HomeworkItem[], args: Record<string, unknown>): HomeworkItem[] {
  let matched = items

  if (typeof args.id === 'string' && args.id.trim()) {
    return matched.filter((item) => item.id === args.id)
  }

  const subject = normalizeSubject(args.subject)
  if (subject) matched = matched.filter((item) => item.subject === subject)

  if (typeof args.title === 'string' && args.title.trim()) {
    const keyword = args.title.trim()
    const byTitle = matched.filter((item) => item.title.includes(keyword) || keyword.includes(item.title))
    if (byTitle.length) matched = byTitle
  }

  return matched
}

async function toolById(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolTraceItem> {
  const date = resolveDate(args.date, ctx)

  switch (name) {
    case 'list_homework': {
      const items = await homeworkStore.refreshDate(date)
      const summary = items.length
        ? `${date} 共 ${items.length} 项作业：${items.map((item) => `${item.subject}·${item.title}(${statusLabel(item.status)})`).join('、')}`
        : `${date} 还没有记录任何作业`
      return makeTrace(name, { date }, true, summary, {
        date,
        items: items.map((item) => ({
          id: item.id,
          subject: item.subject,
          title: item.title,
          status: item.status,
          estimatedMinutes: item.estimatedMinutes,
          actualMinutes: item.actualMinutes,
          note: item.note,
        })),
      })
    }

    case 'add_homework': {
      const subject = normalizeSubject(args.subject)
      const title = typeof args.title === 'string' ? args.title.trim() : ''
      if (!subject || !title) {
        return makeTrace(name, args, false, '新增失败：学科和作业内容都不能为空')
      }
      const existing = await homeworkStore.refreshDate(date)
      const duplicated = existing.find((item) => item.subject === subject && item.title === title)
      if (duplicated) {
        return makeTrace(name, { ...args, date }, true, `${describe(duplicated)} 已存在，没有重复添加`, {
          id: duplicated.id,
          duplicated: true,
        })
      }
      const estimated = Number(args.estimated_minutes)
      const item = await homeworkStore.insert({
        date,
        subject,
        title,
        status: 'todo',
        estimatedMinutes: Number.isFinite(estimated) && estimated > 0 ? Math.round(estimated) : undefined,
        note: typeof args.note === 'string' && args.note.trim() ? args.note.trim() : undefined,
      })
      const extra = item.estimatedMinutes ? `，预计 ${humanizeMinutes(item.estimatedMinutes)}` : ''
      return makeTrace(name, { ...args, date }, true, `新增 ${describe(item)}${extra}`, { id: item.id })
    }

    case 'update_homework': {
      const status = normalizeStatus(args.status)
      const actual = Number(args.actual_minutes)
      const hasActual = Number.isFinite(actual) && actual > 0
      const note = typeof args.note === 'string' && args.note.trim() ? args.note.trim() : undefined
      if (!status && !hasActual && !note) {
        return makeTrace(name, args, false, '更新失败：没有给出要修改的内容（status / actual_minutes / note）')
      }
      const items = await homeworkStore.refreshDate(date)
      const targets = matchItems(items, args)
      if (!targets.length) {
        return makeTrace(name, { ...args, date }, false, `${date} 没有找到匹配的作业，可以先用 list_homework 看一下`)
      }
      const changes: Partial<HomeworkItem> = {}
      if (status) changes.status = status
      if (hasActual) changes.actualMinutes = Math.round(actual)
      if (note !== undefined) changes.note = note
      for (const item of targets) {
        await homeworkStore.patch(item.id, changes)
      }
      const parts: string[] = []
      if (status) {
        parts.push(targets.length === 1 ? `已把 ${describe(targets[0])} 标记为${statusLabel(status)}` : `已把 ${targets.length} 项作业标记为${statusLabel(status)}`)
      }
      if (hasActual) parts.push(`用时 ${humanizeMinutes(Math.round(actual))}`)
      if (note) parts.push(`备注：${note}`)
      const summary = parts.join('，')
      return makeTrace(name, { ...args, date }, true, summary, {
        date,
        updated: targets.map((item) => ({ id: item.id, subject: item.subject, title: item.title, status: status ?? item.status })),
      })
    }

    case 'delete_homework': {
      const items = await homeworkStore.refreshDate(date)
      const targets = matchItems(items, args)
      if (!targets.length) {
        return makeTrace(name, { ...args, date }, false, `${date} 没有找到要删除的作业`)
      }
      for (const item of targets) {
        await homeworkStore.remove(item.id)
      }
      const names = targets.map((item) => `${item.subject}·${item.title}`).join('、')
      return makeTrace(name, { ...args, date }, true, `已删除 ${names}`, { date, deleted: targets.length })
    }

    case 'get_daily_summary': {
      await homeworkStore.refreshDate(date)
      const summary = buildDailySummary(date)
      const text = summary.total
        ? `${date} 共 ${summary.total} 项，已完成 ${summary.done} 项（${summary.doneRate}%）${summary.actualMinutes ? `，累计用时 ${humanizeMinutes(summary.actualMinutes)}` : ''}${summary.pending.length ? `；未完成：${summary.pending.map((item) => `${item.subject}·${item.title}`).join('、')}` : '；全部完成 🎉'}`
        : `${date} 还没有记录作业`
      return makeTrace(name, { date }, true, text, summary)
    }

    default:
      return makeTrace(name, args, false, `未知工具：${name}`)
  }
}

export interface ToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export const toolSchemas: ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'list_homework',
      description: '查询某一天已经记录的作业清单。在不确定存在哪些作业时先调用它。',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: '日期，格式 YYYY-MM-DD，默认使用用户正在查看的日期' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_homework',
      description: '新增一项作业。用户说"今天有/还有/老师布置了……"时使用。',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: '学科，例如 语文、数学、英语' },
          title: { type: 'string', description: '作业内容，尽量简短，例如"口算题卡 第12页"' },
          date: { type: 'string', description: '日期，格式 YYYY-MM-DD，默认用户正在查看的日期' },
          estimated_minutes: { type: 'number', description: '预计完成用时（分钟）' },
          note: { type: 'string', description: '补充备注' },
        },
        required: ['subject', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_homework',
      description:
        '更新作业状态或用时。用户说"写完了/做完了/还没写/正在写"时使用；只传 subject 表示该学科下匹配到的作业都会更新。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '作业 id，最精确的定位方式' },
          subject: { type: 'string', description: '学科，例如 数学' },
          title: { type: 'string', description: '作业内容关键词，用于缩小匹配范围' },
          status: { type: 'string', enum: ['todo', 'doing', 'done'], description: 'todo=未开始，doing=进行中，done=已完成' },
          actual_minutes: { type: 'number', description: '实际用时（分钟）' },
          note: { type: 'string', description: '补充备注' },
          date: { type: 'string', description: '日期，格式 YYYY-MM-DD，默认用户正在查看的日期' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_homework',
      description: '删除记录错误的作业。用户说"删掉/取消/不用做了"时使用。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '作业 id' },
          subject: { type: 'string', description: '学科' },
          title: { type: 'string', description: '作业内容关键词' },
          date: { type: 'string', description: '日期，格式 YYYY-MM-DD' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_daily_summary',
      description: '统计某一天的作业完成情况，包括完成率、累计用时和剩余未完成清单。',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: '日期，格式 YYYY-MM-DD，默认用户正在查看的日期' },
        },
      },
    },
  },
]

/** 执行一次工具调用（读写都走后端 API），返回可直接展示的轨迹记录 */
export async function executeTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolTraceItem> {
  const args = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? (rawArgs as Record<string, unknown>) : {}
  try {
    return await toolById(name, args, ctx)
  } catch (error) {
    return makeTrace(name, args, false, `工具执行异常：${error instanceof Error ? error.message : String(error)}`)
  }
}
