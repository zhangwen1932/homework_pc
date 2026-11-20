import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, ToolTraceItem } from '../types'

interface ChatPanelProps {
  messages: ChatMessage[]
  busy: boolean
  needsSetup: boolean
  examples: string[]
  onSend: (text: string) => void
}

const MODE_LABELS: Record<string, string> = {
  llm: '真实模型',
  none: '未配置',
  manual: '手动操作',
}

function ToolTrace({ items, manual }: { items: ToolTraceItem[]; manual?: boolean }) {
  return (
    <div className="trace">
      <div className="trace-title">
        <span className="trace-dot" />
        {manual ? `手动操作触发了 ${items.length} 次工具` : `Agent 调用了 ${items.length} 次工具`}
      </div>
      {items.map((item) => (
        <details key={item.id} className={item.ok ? 'trace-item' : 'trace-item is-fail'}>
          <summary>
            <code>{item.name}</code>
            <span className="trace-summary">{item.summary}</span>
          </summary>
          <pre>{JSON.stringify(item.args, null, 2)}</pre>
          {item.data !== undefined && <pre>{JSON.stringify(item.data, null, 2)}</pre>}
        </details>
      ))}
    </div>
  )
}

export default function ChatPanel({ messages, busy, needsSetup, examples, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, busy])

  const submit = () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    onSend(text)
  }

  return (
    <section className="panel chat-panel">
      <header className="panel-head">
        <div>
          <h2>和作业小管家说</h2>
          <p className="panel-sub">一句话描述作业情况，Agent 会自动调用工具记录</p>
        </div>
      </header>

      <div className="chat-list" ref={listRef}>
        {messages.map((message) => (
          <div key={message.id} className={`bubble-row ${message.role === 'user' ? 'is-user' : 'is-agent'}`}>
            <div className={`bubble ${message.tone === 'error' ? 'is-error' : ''}`}>
              <div className="bubble-text">{message.content}</div>
              {message.trace && message.trace.length > 0 && (
                <ToolTrace items={message.trace} manual={message.mode === 'manual'} />
              )}
              {message.role === 'assistant' && message.mode && (
                <div className="bubble-meta">由 {MODE_LABELS[message.mode]} 处理</div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="bubble-row is-agent">
            <div className="bubble">
              <div className="bubble-text">
                <span className="typing">
                  <i />
                  <i />
                  <i />
                </span>
                正在思考并调用工具…
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="examples">
        {examples.map((example) => (
          <button key={example} type="button" className="chip" onClick={() => onSend(example)} disabled={busy}>
            {example}
          </button>
        ))}
      </div>

      <div className="composer">
        <textarea
          value={draft}
          rows={2}
          placeholder="例如：数学口算题卡写完了，用了 25 分钟；明天有英语单词听写"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <button type="button" className="send-btn" onClick={submit} disabled={busy || !draft.trim()}>
          发送
        </button>
      </div>

      {needsSetup && (
        <p className="setup-hint">
          当前未配置模型 API Key，AI 对话暂不可用。请打开右上角「管理后台」，在「模型配置」里填写
          API Key 并保存，然后回到这里重新发送。
        </p>
      )}
    </section>
  )
}
