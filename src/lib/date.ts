const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayKey(): string {
  return toDateKey(new Date())
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function shiftDateKey(key: string, days: number): string {
  const date = fromDateKey(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/** 相对今天的偏移天数（正数为未来） */
function diffFromToday(key: string): number {
  const ms = fromDateKey(key).getTime() - fromDateKey(todayKey()).getTime()
  return Math.round(ms / 86400000)
}

function relativeLabel(diff: number): string | undefined {
  switch (diff) {
    case 0:
      return '今天'
    case 1:
      return '明天'
    case 2:
      return '后天'
    case -1:
      return '昨天'
    case -2:
      return '前天'
    default:
      return undefined
  }
}

/** 例如：今天 · 9月15日 周一 */
export function formatDateLabel(key: string): string {
  const date = fromDateKey(key)
  const relative = relativeLabel(diffFromToday(key))
  const base = `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`
  return relative ? `${relative} · ${base}` : base
}

/** 解析自然语言里的相对日期，未命中返回 undefined */
export function parseRelativeDate(text: string, baseDate: string): string | undefined {
  const rules: Array<[RegExp, number]> = [
    [/大后天/, 3],
    [/后天/, 2],
    [/明天|明日/, 1],
    [/今天|今日|当天/, 0],
    [/昨天|昨日/, -1],
    [/前天/, -2],
  ]
  for (const [pattern, offset] of rules) {
    if (pattern.test(text)) return shiftDateKey(baseDate, offset)
  }
  return undefined
}

/** 例如：1小时30分 */
export function humanizeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}小时${m}分` : `${h}小时`
}
