import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = dirname(fileURLToPath(import.meta.url))
/** SQLite 数据库文件位置，可用环境变量 SQLITE_FILE 覆盖 */
const DB_FILE = process.env.SQLITE_FILE || join(__dirname, 'data', 'homework.db')

let nextId = 0
export function uid(prefix = 'id') {
  nextId += 1
  return `${prefix}_${Date.now().toString(36)}_${nextId}`
}

/** 本地日期，格式 YYYY-MM-DD */
export function todayKey() {
  const d = new Date()
  const month = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

mkdirSync(dirname(DB_FILE), { recursive: true })
const db = new DatabaseSync(DB_FILE)

db.exec(`
  CREATE TABLE IF NOT EXISTS homework (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    subject TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    estimated_minutes INTEGER,
    actual_minutes INTEGER,
    note TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_homework_date ON homework (date);
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

/** 供其他模块（如配置表）复用同一个数据库连接 */
export { db }

/** 行 → 前端 HomeworkItem 形状（snake_case → camelCase，空值转 undefined） */
function toItem(row) {
  if (!row) return undefined
  return {
    id: row.id,
    date: row.date,
    subject: row.subject,
    title: row.title,
    status: row.status,
    estimatedMinutes: row.estimated_minutes ?? undefined,
    actualMinutes: row.actual_minutes ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const insertStmt = db.prepare(
  `INSERT INTO homework (id, date, subject, title, status, estimated_minutes, actual_minutes, note, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
)
const byIdStmt = db.prepare('SELECT * FROM homework WHERE id = ?')
const byDateStmt = db.prepare('SELECT * FROM homework WHERE date = ? ORDER BY rowid')
const allStmt = db.prepare('SELECT * FROM homework ORDER BY rowid')
const deleteStmt = db.prepare('DELETE FROM homework WHERE id = ?')

/** patch 支持修改的字段：JS 属性名 → 数据库列名 */
const PATCHABLE = {
  date: 'date',
  subject: 'subject',
  title: 'title',
  status: 'status',
  estimatedMinutes: 'estimated_minutes',
  actualMinutes: 'actual_minutes',
  note: 'note',
}

export const homeworkStore = {
  /** 全部数据按日期分组：{ 'YYYY-MM-DD': HomeworkItem[] } */
  getAll() {
    const grouped = {}
    for (const row of allStmt.iterate()) {
      ;(grouped[row.date] ??= []).push(toItem(row))
    }
    return grouped
  },

  getByDate(date) {
    return byDateStmt.all(date).map(toItem)
  },

  findById(id) {
    return toItem(byIdStmt.get(id))
  },

  insert(item) {
    insertStmt.run(
      item.id,
      item.date,
      item.subject,
      item.title,
      item.status,
      item.estimatedMinutes ?? null,
      item.actualMinutes ?? null,
      item.note ?? null,
      item.createdAt,
      item.updatedAt,
    )
  },

  patch(id, changes) {
    const sets = []
    const values = []
    for (const [key, column] of Object.entries(PATCHABLE)) {
      // key 存在即生效（值可为 undefined，表示清空该字段）
      if (!(key in changes)) continue
      sets.push(`${column} = ?`)
      values.push(changes[key] ?? null)
    }
    if (!sets.length) return homeworkStore.findById(id)
    sets.push('updated_at = ?')
    values.push(Date.now(), id)
    db.prepare(`UPDATE homework SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    return homeworkStore.findById(id)
  },

  remove(id) {
    const existing = homeworkStore.findById(id)
    if (!existing) return undefined
    deleteStmt.run(id)
    return existing
  },
}
