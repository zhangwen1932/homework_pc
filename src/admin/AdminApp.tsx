import { useCallback, useEffect, useMemo, useState } from 'react'
import type { HomeworkItem, HomeworkStatus } from '../types'
import LoginForm from './LoginForm'
import type { Me } from './LoginForm'

/** 开发期直连后端(5173 → 3001，后端已开 CORS)；生产环境同源部署走相对路径 */
const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''

interface LlmStatus {
  configured: boolean
  model: string
  baseUrl: string
}

/** GET /api/llm/config 返回的脱敏视图 */
interface LlmConfigView {
  baseUrl: string
  model: string
  hasApiKey: boolean
  apiKeyPreview: string
}

const STATUS_TEXT: Record<HomeworkStatus, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
}

function summarize(items: HomeworkItem[]) {
  const done = items.filter((item) => item.status === 'done').length
  const doing = items.filter((item) => item.status === 'doing').length
  return { total: items.length, done, doing, todo: items.length - done - doing }
}

function formatMinutes(minutes: number) {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes} 分钟`
  const rest = minutes % 60
  return rest ? `${Math.floor(minutes / 60)} 小时 ${rest} 分` : `${Math.floor(minutes / 60)} 小时`
}

function formatTime(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function groupBy(items: HomeworkItem[], key: (item: HomeworkItem) => string) {
  const map = new Map<string, HomeworkItem[]>()
  for (const item of items) {
    const group = key(item)
    const list = map.get(group)
    if (list) list.push(item)
    else map.set(group, [item])
  }
  return map
}

export default function AdminApp() {
  /** undefined = 正在检查登录态；null = 未登录；否则为已登录用户 */
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [items, setItems] = useState<HomeworkItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<LlmStatus | null>(null)
  const [config, setConfig] = useState<LlmConfigView | null>(null)

  /** 模型配置表单 */
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [formTouched, setFormTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveNote, setSaveNote] = useState('')

  const load = useCallback(async (role: 'admin' | 'user') => {
    try {
      const [statusRes, configRes] = await Promise.all([
        fetch(`${API_BASE}/api/llm/status`),
        fetch(`${API_BASE}/api/llm/config`),
      ])
      if (!statusRes.ok || !configRes.ok) throw new Error('接口请求失败')
      const statusJson = (await statusRes.json()) as LlmStatus
      const configJson = (await configRes.json()) as LlmConfigView
      /** 作业数据仅管理员可见；普通用户只展示模型配置 */
      if (role === 'admin') {
        const hwRes = await fetch(`${API_BASE}/api/homework`)
        if (!hwRes.ok) throw new Error('接口请求失败')
        const hwJson = (await hwRes.json()) as { data?: HomeworkItem[] | Record<string, HomeworkItem[]> }
        /** 不带 date 时接口返回按日期分组的对象，这里摊平成列表 */
        const raw = hwJson.data
        setItems(Array.isArray(raw) ? raw : Object.values(raw ?? {}).flat())
      }
      setStatus(statusJson)
      setConfig(configJson)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoaded(true)
    }
  }, [])

  /** 进入页面先确认登录态 */
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          setMe(null)
          return
        }
        const json = await res.json()
        setMe({ username: json.username, role: json.role })
      })
      .catch(() => setMe(null))
  }, [])

  useEffect(() => {
    if (!me) return
    void load(me.role)
  }, [me, load])

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    } finally {
      setMe(null)
    }
  }, [])

  /** 表单未被动过时跟随数据库配置刷新，避免覆盖用户正在编辑的内容 */
  useEffect(() => {
    if (!config || formTouched) return
    setBaseUrl(config.baseUrl)
    setModel(config.model)
  }, [config, formTouched])

  const saveConfig = useCallback(async () => {
    const payload: Record<string, string> = {}
    if (apiKey.trim()) payload.apiKey = apiKey.trim()
    if (config && baseUrl !== config.baseUrl) payload.baseUrl = baseUrl
    if (config && model !== config.model) payload.model = model
    if (!Object.keys(payload).length) {
      setSaveNote('没有需要保存的修改')
      return
    }
    setSaving(true)
    setSaveNote('')
    try {
      const res = await fetch(`${API_BASE}/api/llm/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || '保存失败')
      setApiKey('')
      setFormTouched(false)
      setSaveNote('已保存，配置即时生效')
      await load(me?.role ?? 'user')
    } catch (err) {
      setSaveNote(`保存失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }, [apiKey, baseUrl, config, load, me, model])

  const clearApiKey = useCallback(async () => {
    setSaving(true)
    setSaveNote('')
    try {
      const res = await fetch(`${API_BASE}/api/llm/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: '' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || '清除失败')
      setApiKey('')
      setFormTouched(false)
      setSaveNote('已清除 API Key，回退到环境变量/默认值')
      await load(me?.role ?? 'user')
    } catch (err) {
      setSaveNote(`清除失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }, [load, me])

  const overview = useMemo(() => {
    const s = summarize(items)
    const minutes = items.reduce((sum, item) => sum + (item.actualMinutes ?? 0), 0)
    return {
      ...s,
      days: new Set(items.map((item) => item.date)).size,
      minutes,
      doneRate: s.total ? Math.round((s.done / s.total) * 100) : 0,
    }
  }, [items])

  const dailyRows = useMemo(
    () =>
      [...groupBy(items, (item) => item.date).entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([date, list]) => {
          const s = summarize(list)
          return {
            date,
            ...s,
            minutes: list.reduce((sum, item) => sum + (item.actualMinutes ?? 0), 0),
            doneRate: s.total ? Math.round((s.done / s.total) * 100) : 0,
          }
        }),
    [items],
  )

  const subjectRows = useMemo(
    () =>
      [...groupBy(items, (item) => item.subject).entries()]
        .map(([subject, list]) => ({
          subject,
          ...summarize(list),
          minutes: list.reduce((sum, item) => sum + (item.actualMinutes ?? 0), 0),
        }))
        .sort((a, b) => b.total - a.total),
    [items],
  )

  const recentItems = useMemo(
    () => [...items].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20),
    [items],
  )

  /** 登录门控：确认登录态 → 登录页 → 按角色渲染 */
  if (me === undefined) {
    return <div className="login-wrap login-loading">正在检查登录状态…</div>
  }
  if (me === null) {
    return <LoginForm onSuccess={setMe} />
  }

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1>作业小管家 · 管理后台</h1>
          <p>查看作业数据统计与模型配置，数据来自后端 SQLite 数据库</p>
        </div>
        <div className="head-side">
          <span className={`mode-pill ${status?.configured ? 'is-live' : 'is-warn'}`}>
            {status ? (status.configured ? `真实模型 · ${status.model}` : '未配置 API Key') : '检测中…'}
          </span>
          <span className={`role-badge ${me.role}`}>
            {me.role === 'admin' ? `管理员 · ${me.username}` : `普通用户 · ${me.username}`}
          </span>
          {me.role === 'admin' && (
            <button className="ghost-btn" onClick={() => void load(me.role)}>
              刷新数据
            </button>
          )}
          <button className="ghost-btn" onClick={() => void logout()}>
            退出登录
          </button>
          <a className="ghost-link" href="/">
            返回首页
          </a>
        </div>
      </header>

      {error && <p className="admin-error">数据加载失败：{error}（请确认后端服务已启动）</p>}

      {me.role === 'admin' && (
      <section className="stat-cards">
        <div className="stat-card">
          <span className="stat-card-value">{overview.total}</span>
          <span className="stat-card-label">总记录数</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value">{overview.days}</span>
          <span className="stat-card-label">覆盖天数</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value">{overview.doneRate}%</span>
          <span className="stat-card-label">总体完成率</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value">{overview.done}</span>
          <span className="stat-card-label">已完成</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value">{overview.doing}</span>
          <span className="stat-card-label">进行中</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value">{overview.todo}</span>
          <span className="stat-card-label">待办</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value">{formatMinutes(overview.minutes)}</span>
          <span className="stat-card-label">累计实际用时</span>
        </div>
      </section>
      )}

      <main className="admin-grid">
        {me.role === 'admin' && (
        <>
        <section className="panel">
          <div className="panel-head">
            <h2>每日概览</h2>
            <p className="panel-sub">按日期统计作业完成情况</p>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>总数</th>
                  <th>完成</th>
                  <th>进行中</th>
                  <th>待办</th>
                  <th>完成率</th>
                  <th>实际用时</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{row.total}</td>
                    <td>{row.done}</td>
                    <td>{row.doing}</td>
                    <td>{row.todo}</td>
                    <td>
                      <div className="bar-cell">
                        <div className="bar">
                          <span style={{ width: `${row.doneRate}%` }} />
                        </div>
                        {row.doneRate}%
                      </div>
                    </td>
                    <td>{formatMinutes(row.minutes)}</td>
                  </tr>
                ))}
                {!dailyRows.length && (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      {loaded ? '暂无数据' : '加载中…'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>学科分布</h2>
            <p className="panel-sub">各学科任务量与用时</p>
          </div>
          <div className="subject-list">
            {subjectRows.map((row) => {
              const percent = overview.total ? Math.round((row.total / overview.total) * 100) : 0
              return (
                <div key={row.subject} className="subject-row">
                  <div className="subject-row-head">
                    <strong>{row.subject}</strong>
                    <span>
                      {row.total} 项 · 完成 {row.done} · {formatMinutes(row.minutes)}
                    </span>
                  </div>
                  <div className="bar">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>
              )
            })}
            {!subjectRows.length && <p className="table-empty">{loaded ? '暂无数据' : '加载中…'}</p>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>最近记录</h2>
            <p className="panel-sub">最新 20 条作业记录</p>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>学科</th>
                  <th>内容</th>
                  <th>状态</th>
                  <th>预计/实际(分)</th>
                  <th>备注</th>
                  <th>记录时间</th>
                </tr>
              </thead>
              <tbody>
                {recentItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.date}</td>
                    <td>
                      <span className="subject-tag">{item.subject}</span>
                    </td>
                    <td className="cell-title">{item.title}</td>
                    <td>
                      <span className={`badge status-${item.status}`}>{STATUS_TEXT[item.status]}</span>
                    </td>
                    <td>
                      {item.estimatedMinutes ?? '—'} / {item.actualMinutes ?? '—'}
                    </td>
                    <td className="cell-note">{item.note || '—'}</td>
                    <td>{formatTime(item.createdAt)}</td>
                  </tr>
                ))}
                {!recentItems.length && (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      {loaded ? '暂无数据' : '加载中…'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        </>
        )}

        <section className="panel">
          <div className="panel-head">
            <h2>模型配置</h2>
            <p className="panel-sub">保存在数据库，修改即时生效{me.role === 'user' ? '（普通用户仅可查看）' : ''}</p>
          </div>
          <div className="config-body">
            <div className="config-current">
              <p>
                当前模型：<code>{config?.model || '—'}</code>
              </p>
              <p>
                接口地址：<code>{config?.baseUrl || '—'}</code>
              </p>
              <p>
                API Key：
                {config?.hasApiKey ? (
                  <code>{config.apiKeyPreview}</code>
                ) : (
                  <span className="text-muted">未配置（本地模拟模式）</span>
                )}
              </p>
            </div>
            {me.role === 'user' && <p className="readonly-hint">普通用户仅可查看模型配置，如需修改请联系管理员。</p>}
            {me.role === 'admin' && (
            <>
            <label className="field">
              <span>
                新 API Key
                {config?.hasApiKey && <em>（已配置 {config.apiKeyPreview}，留空表示不修改）</em>}
              </span>
              <input
                type="password"
                value={apiKey}
                placeholder={config?.hasApiKey ? '••••••••' : 'sk-...'}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setFormTouched(true)
                }}
              />
            </label>
            <label className="field">
              <span>接口地址 Base URL</span>
              <input
                value={baseUrl}
                placeholder="https://api.openai.com/v1"
                onChange={(e) => {
                  setBaseUrl(e.target.value)
                  setFormTouched(true)
                }}
              />
            </label>
            <label className="field">
              <span>模型名称</span>
              <input
                value={model}
                placeholder="gpt-4o-mini"
                onChange={(e) => {
                  setModel(e.target.value)
                  setFormTouched(true)
                }}
              />
            </label>
            <div className="config-actions">
              <button className="primary-btn" disabled={saving} onClick={() => void saveConfig()}>
                {saving ? '保存中…' : '保存配置'}
              </button>
              {config?.hasApiKey && (
                <button className="ghost-btn" disabled={saving} onClick={() => void clearApiKey()}>
                  清除 Key
                </button>
              )}
            </div>
            </>
            )}
            {saveNote && <p className="save-note">{saveNote}</p>}
          </div>
        </section>
      </main>
    </div>
  )
}
