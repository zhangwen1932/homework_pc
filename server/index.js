import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { authRouter } from './auth.js'
import { getLlmConfig } from './config.js'
import { homeworkRouter } from './homework.js'
import { llmRouter } from './llm.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 3001

const app = express()
app.disable('x-powered-by')

/** 开发时前端 dev server(5173) 可直连后端，放行跨域；登录会话走 Cookie，需允许凭证 */
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), model: getLlmConfig().model })
})

app.use('/api/auth', authRouter())
app.use('/api/llm', llmRouter())
app.use('/api/homework', homeworkRouter())

/** 未命中的 API 路由统一返回 404 JSON，避免落到前端页面 */
app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, reason: 'not_found' })
})

/** 生产模式：托管前端构建产物，其余路径走 SPA 回退 */
const distDir = join(__dirname, '..', 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  /** 管理后台：/admin 与 /admin.html 都指向 admin 入口 */
  app.get(['/admin', '/admin/'], (_req, res) => {
    res.sendFile(join(distDir, 'admin.html'))
  })
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      next()
      return
    }
    res.sendFile(join(distDir, 'index.html'))
  })
}

/** 统一错误处理：JSON 解析失败等返回 400 */
app.use((error, _req, res, _next) => {
  const isBodyParse = error?.type === 'entity.parse.failed'
  res.status(isBodyParse ? 400 : 500).json({
    ok: false,
    reason: isBodyParse ? 'bad_json' : 'server_error',
    message: error?.message,
  })
})

app.listen(PORT, () => {
  const configured = Boolean((process.env.OPENAI_API_KEY || '').trim())
  console.log(`[homework-agent] 后端已启动: http://localhost:${PORT}`)
  console.log(`[homework-agent] 模型代理 ${configured ? `已配置 ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}` : '未配置 OPENAI_API_KEY，/api/llm/chat 将返回 no_key'}`)
})
