import { Router } from 'express'
import { requireAdmin } from './auth.js'
import { configView, getLlmConfig, saveLlmConfig } from './config.js'

/**
 * LLM 路由，与 Vite 开发中间件保持相同的接口契约：
 * - GET  /api/llm/status
 * - POST /api/llm/chat
 * 另外提供配置管理（存 SQLite，修改即时生效，无需重启）：
 * - GET  /api/llm/config（Key 脱敏展示）
 * - PUT  /api/llm/config
 * API Key 只存在于服务端，不会暴露给浏览器。
 */
export function llmRouter() {
  const router = Router()

  router.get(['/status', '/'], (_req, res) => {
    const { apiKey, baseUrl, model } = getLlmConfig()
    res.json({ ok: true, configured: Boolean(apiKey), model, baseUrl })
  })

  /** 查看配置（Key 脱敏） */
  router.get('/config', (_req, res) => {
    res.json({ ok: true, ...configView() })
  })

  /** 更新配置（仅管理员）；字段省略表示不修改，空字符串表示清空回退到环境变量/默认值 */
  router.put('/config', requireAdmin, (req, res) => {
    const body = req.body ?? {}
    for (const field of ['apiKey', 'baseUrl', 'model']) {
      if (body[field] !== undefined && typeof body[field] !== 'string') {
        res.status(400).json({ ok: false, message: `${field} 需为字符串` })
        return
      }
    }
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : ''
    if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
      res.status(400).json({ ok: false, message: 'baseUrl 需以 http:// 或 https:// 开头' })
      return
    }
    saveLlmConfig(body)
    res.json({ ok: true, ...configView() })
  })

  router.post('/chat', async (req, res) => {
    const { apiKey, baseUrl, model } = getLlmConfig()

    if (!apiKey) {
      res.json({
        ok: false,
        reason: 'no_key',
        message: '未配置模型 Key，可通过 PUT /api/llm/config 写入，或在服务端 .env 中配置后重启',
      })
      return
    }

    try {
      const started = Date.now()
      /** 请求体里注入数据库配置的模型名（前端不发 model，以此保证后台改模型即时生效） */
      const payload = { model, ...req.body }
      const upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      })
      const text = await upstream.text()
      console.log(`[llm] model=${model} status=${upstream.status} ${Date.now() - started}ms`)
      res.statusCode = upstream.status
      res.type('application/json; charset=utf-8')
      res.send(text)
    } catch (error) {
      res.status(502).json({
        ok: false,
        reason: 'upstream_error',
        message: `调用模型失败：${error instanceof Error ? error.message : String(error)}`,
      })
    }
  })

  return router
}
