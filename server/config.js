import { db } from './store.js'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'

/** 配置字段 → 数据库 app_config.key */
const CONFIG_KEYS = {
  apiKey: 'openai_api_key',
  baseUrl: 'openai_base_url',
  model: 'openai_model',
}

const getStmt = db.prepare('SELECT value FROM app_config WHERE key = ?')
const setStmt = db.prepare(
  `INSERT INTO app_config (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
)

/**
 * 读单个配置项。数据库里有非空值就用库里的；
 * 没有该行或被显式清空（空串）时，回退到环境变量 / 默认值。
 */
function readValue(field) {
  const row = getStmt.get(CONFIG_KEYS[field])
  const stored = row ? row.value.trim() : ''
  if (stored) return stored
  if (field === 'apiKey') return (process.env.OPENAI_API_KEY || '').trim()
  if (field === 'baseUrl') return process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL
  return process.env.OPENAI_MODEL || DEFAULT_MODEL
}

/** 当前生效的模型配置：数据库 > 环境变量 > 默认值 */
export function getLlmConfig() {
  return {
    apiKey: readValue('apiKey'),
    baseUrl: readValue('baseUrl').replace(/\/+$/, ''),
    model: readValue('model'),
  }
}

/** 覆盖或清空配置；patch 中未出现的字段不修改，空字符串表示清空（回退到环境变量/默认值） */
export function saveLlmConfig(patch) {
  for (const field of Object.keys(CONFIG_KEYS)) {
    if (!(field in patch)) continue
    setStmt.run(CONFIG_KEYS[field], typeof patch[field] === 'string' ? patch[field].trim() : '')
  }
  return getLlmConfig()
}

/** 对外展示时永远脱敏，只保留末 4 位 */
export function maskApiKey(key) {
  if (!key) return ''
  return key.length <= 8 ? '••••••' : `••••••${key.slice(-4)}`
}

/** 给前端的配置视图，绝不包含完整 Key */
export function configView() {
  const { apiKey, baseUrl, model } = getLlmConfig()
  return { baseUrl, model, hasApiKey: Boolean(apiKey), apiKeyPreview: maskApiKey(apiKey) }
}
