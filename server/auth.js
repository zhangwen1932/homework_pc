import { randomBytes } from 'node:crypto'
import { Router } from 'express'

/** 内置账号（demo 用）：admin 管理员全权限 / user 普通用户只读模型配置 */
const USERS = {
  admin: { password: '103086', role: 'admin' },
  user: { password: '666666', role: 'user' },
}

/** 会话存内存即可：重启失效，不做持久化（demo 场景足够） */
const sessions = new Map()
const COOKIE_NAME = 'admin_session'
const MAX_AGE_SECONDS = 12 * 60 * 60

function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  if (Date.now() - session.createdAt > MAX_AGE_SECONDS * 1000) {
    sessions.delete(token)
    return null
  }
  return { ...session, token }
}

export function sessionCookie(token, maxAge) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`
}

/** 写操作守卫：未登录 401，非管理员 403 */
export function requireAdmin(req, res, next) {
  const user = currentUser(req)
  if (!user) {
    res.status(401).json({ ok: false, message: '未登录，请先登录管理后台' })
    return
  }
  if (user.role !== 'admin') {
    res.status(403).json({ ok: false, message: '需要管理员权限，普通用户仅可查看' })
    return
  }
  req.user = user
  next()
}

export function authRouter() {
  const router = Router()

  router.post('/login', (req, res) => {
    const body = req.body ?? {}
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
    const account = USERS[username]
    if (!account || account.password !== String(body.password ?? '')) {
      res.status(401).json({ ok: false, message: '用户名或密码错误' })
      return
    }
    const token = randomBytes(24).toString('hex')
    sessions.set(token, { username, role: account.role, createdAt: Date.now() })
    res.setHeader('Set-Cookie', sessionCookie(token, MAX_AGE_SECONDS))
    res.json({ ok: true, username, role: account.role })
  })

  router.post('/logout', (req, res) => {
    const user = currentUser(req)
    if (user) sessions.delete(user.token)
    res.setHeader('Set-Cookie', sessionCookie('', 0))
    res.json({ ok: true })
  })

  router.get('/me', (req, res) => {
    const user = currentUser(req)
    if (!user) {
      res.status(401).json({ ok: false, message: '未登录' })
      return
    }
    res.json({ ok: true, username: user.username, role: user.role })
  })

  return router
}
