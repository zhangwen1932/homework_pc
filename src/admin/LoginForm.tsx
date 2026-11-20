import { useState } from 'react'
import type { FormEvent } from 'react'

/** 开发期直连后端(5173 → 3001，后端已开 CORS)；生产环境同源部署走相对路径 */
const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''

export interface Me {
  username: string
  role: 'admin' | 'user'
}

export default function LoginForm({ onSuccess }: { onSuccess: (me: Me) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!username.trim() || !password) {
      setError('请输入用户名和密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || '登录失败')
      onSuccess({ username: json.username, role: json.role })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={(e) => void submit(e)}>
        <h1>作业小管家 · 管理后台</h1>
        <p className="login-sub">请登录后继续</p>
        <label className="field">
          <span>用户名</span>
          <input
            value={username}
            placeholder="admin 或 user"
            autoFocus
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            placeholder="请输入密码"
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  )
}
