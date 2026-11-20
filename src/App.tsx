import { useCallback, useEffect, useState } from 'react'
import ChatPanel from './components/ChatPanel'
import HomeworkBoard from './components/HomeworkBoard'
import { runAgent } from './lib/agent'
import { getLlmStatus } from './lib/llm'
import { shiftDateKey, todayKey } from './lib/date'
import { homeworkStore, uid, useHomework } from './lib/store'
import { executeTool } from './lib/tools'
import type { AgentMode, ChatMessage } from './types'

const EXAMPLES = [
  '数学口算题卡写完了，用了 25 分钟',
  '明天有英语单词听写，预计 15 分钟',
  '语文还有一篇作文',
  '今天作业完成得怎么样？',
]

export default function App() {
  const [dateKey, setDateKey] = useState(todayKey)
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: uid('msg'),
      role: 'assistant',
      content: '你好，我是作业小管家 👋\n直接用一句话告诉我孩子的作业情况，我会自动调用工具记录到右边的作业本上。',
    },
  ])
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<AgentMode>('none')
  const [modeNote, setModeNote] = useState('检测模型中…')
  const items = useHomework(dateKey)

  useEffect(() => {
    void getLlmStatus().then((status) => {
      console.log('status', status);
      setMode(status.configured ? 'llm' : 'none')
      setModeNote(status.configured ? `真实模型 · ${status.model}` : '未配置 API Key')
    })
  }, [])

  /** 看板数据从后端拉取，切换日期时重新加载 */
  useEffect(() => {
    homeworkStore.refreshDate(dateKey).catch((error) => {
      console.error('加载作业数据失败', error)
    })
  }, [dateKey])

  const handleSend = useCallback(
    async (text: string) => {
      setMessages((prev) => [...prev, { id: uid('msg'), role: 'user', content: text }])
      setBusy(true)
      try {
        const result = await runAgent(text, { date: dateKey })
        console.log('result', result);
        setMessages((prev) => [
          ...prev,
          {
            id: uid('msg'),
            role: 'assistant',
            content: result.reply,
            trace: result.trace,
            mode: result.mode,
            tone: result.tone === 'error' ? 'error' : undefined,
          },
        ])
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid('msg'),
            role: 'assistant',
            content: `出错了：${error instanceof Error ? error.message : String(error)}`,
            tone: 'error',
          },
        ])
      } finally {
        setBusy(false)
      }
    },
    [dateKey],
  )

  /** 看板上的手动按钮复用同一套工具，保证两边的行为一致 */
  const handleAction = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      try {
        const trace = await executeTool(name, args, { date: dateKey })
        setMessages((prev) => [
          ...prev,
          { id: uid('msg'), role: 'assistant', content: trace.summary, trace: [trace], mode: 'manual' },
        ])
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid('msg'),
            role: 'assistant',
            content: `操作失败：${error instanceof Error ? error.message : String(error)}`,
            tone: 'error',
          },
        ])
      }
    },
    [dateKey],
  )

  return (
    <div className="app">
      <header className="app-head">
        <div>
          <h1>作业小管家 · AI Agent Demo</h1>
          <p>自然语言记作业：模型负责理解，工具负责读写数据，Agent 负责把两者串起来</p>
        </div>
        <div className="head-side">
          <span className={`mode-pill ${mode === 'llm' ? 'is-live' : 'is-warn'}`}>{modeNote}</span>
          <a className="admin-link" href="/admin.html">
            管理后台
          </a>
        </div>
      </header>

      <main className="layout">
        <ChatPanel
          messages={messages}
          busy={busy}
          needsSetup={mode === 'none'}
          examples={EXAMPLES}
          onSend={handleSend}
        />
        <HomeworkBoard
          dateKey={dateKey}
          items={items}
          onShiftDate={(delta) => setDateKey((current) => shiftDateKey(current, delta))}
          onToday={() => setDateKey(todayKey())}
          onAction={handleAction}
          onClear={() => void homeworkStore.clearAll()}
        />
      </main>
    </div>
  )
}
