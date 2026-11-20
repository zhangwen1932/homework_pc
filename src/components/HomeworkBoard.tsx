import type { CSSProperties } from 'react'
import { formatDateLabel, humanizeMinutes, todayKey } from '../lib/date'
import { STATUS_LABELS } from '../lib/tools'
import type { HomeworkItem } from '../types'

interface HomeworkBoardProps {
  dateKey: string
  items: HomeworkItem[]
  onShiftDate: (delta: number) => void
  onToday: () => void
  onAction: (name: string, args: Record<string, unknown>) => void
  onClear: () => void
}

function subjectHue(subject: string): number {
  let hash = 0
  for (const char of subject) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

function subjectStyle(subject: string): CSSProperties {
  const hue = subjectHue(subject)
  return {
    background: `hsl(${hue} 85% 96%)`,
    color: `hsl(${hue} 55% 33%)`,
    borderColor: `hsl(${hue} 70% 88%)`,
  }
}

export default function HomeworkBoard({
  dateKey,
  items,
  onShiftDate,
  onToday,
  onAction,
  onClear,
}: HomeworkBoardProps) {
  const done = items.filter((item) => item.status === 'done').length
  const doing = items.filter((item) => item.status === 'doing').length
  const rate = items.length ? Math.round((done / items.length) * 100) : 0
  const minutes = items.reduce((sum, item) => sum + (item.actualMinutes ?? 0), 0)

  const groups = new Map<string, HomeworkItem[]>()
  for (const item of items) {
    const list = groups.get(item.subject)
    if (list) list.push(item)
    else groups.set(item.subject, [item])
  }

  return (
    <section className="panel board-panel">
      <header className="panel-head">
        <div>
          <h2>作业本</h2>
          <p className="panel-sub">Agent 和手动操作改的是同一份数据</p>
        </div>
        <div className="date-nav">
          <button type="button" onClick={() => onShiftDate(-1)} aria-label="前一天">
            ‹
          </button>
          <span className="date-label">{formatDateLabel(dateKey)}</span>
          <button type="button" onClick={() => onShiftDate(1)} aria-label="后一天">
            ›
          </button>
        </div>
      </header>

      <div className="stats">
        <div className="stat">
          <span className="stat-value">
            {done}/{items.length}
          </span>
          <span className="stat-label">已完成</span>
        </div>
        <div className="stat">
          <span className="stat-value">{doing}</span>
          <span className="stat-label">进行中</span>
        </div>
        <div className="stat">
          <span className="stat-value">{rate}%</span>
          <span className="stat-label">完成率</span>
        </div>
        <div className="stat">
          <span className="stat-value">{minutes ? humanizeMinutes(minutes) : '—'}</span>
          <span className="stat-label">累计用时</span>
        </div>
      </div>
      <div className="progress">
        <span style={{ width: `${rate}%` }} />
      </div>

      <div className="board-body">
        {items.length === 0 ? (
          <p className="empty">
            这一天还没有作业记录。
            <br />
            可以在左边说一句「明天有英语单词听写」试试。
          </p>
        ) : (
          Array.from(groups, ([subject, group]) => (
            <div className="subject-group" key={subject}>
              <div className="subject-title">
                <span className="subject-tag" style={subjectStyle(subject)}>
                  {subject}
                </span>
                <span className="subject-count">{group.length} 项</span>
              </div>
              {group.map((item) => (
                <article className={`card status-${item.status}`} key={item.id}>
                  <div className="card-main">
                    <div className="card-title">{item.title}</div>
                    <div className="card-meta">
                      <span className={`badge status-${item.status}`}>{STATUS_LABELS[item.status]}</span>
                      {item.estimatedMinutes ? <span>预计 {humanizeMinutes(item.estimatedMinutes)}</span> : null}
                      {item.actualMinutes ? <span>实际 {humanizeMinutes(item.actualMinutes)}</span> : null}
                      {item.note ? <span className="card-note">{item.note}</span> : null}
                    </div>
                  </div>
                  <div className="card-actions">
                    {item.status === 'todo' && (
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => onAction('update_homework', { id: item.id, status: 'doing' })}
                      >
                        开始
                      </button>
                    )}
                    {item.status !== 'done' && (
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => onAction('update_homework', { id: item.id, status: 'done' })}
                      >
                        完成
                      </button>
                    )}
                    {item.status === 'done' && (
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => onAction('update_homework', { id: item.id, status: 'todo' })}
                      >
                        撤销
                      </button>
                    )}
                    <button
                      type="button"
                      className="ghost-btn danger"
                      onClick={() => onAction('delete_homework', { id: item.id })}
                    >
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ))
        )}
      </div>

      <footer className="board-foot">
        {dateKey !== todayKey() && (
          <button type="button" className="ghost-btn" onClick={onToday}>
            回到今天
          </button>
        )}
        <button type="button" className="ghost-btn danger" onClick={onClear}>
          清空全部
        </button>
      </footer>
    </section>
  )
}
