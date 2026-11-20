import { Router } from 'express'
import { homeworkStore, todayKey, uid } from './store.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const STATUSES = new Set(['todo', 'doing', 'done'])

function resolveDate(value) {
  return typeof value === 'string' && DATE_RE.test(value) ? value : todayKey()
}

function finiteMinutes(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? Math.round(num) : undefined
}

function toDailySummary(date) {
  const items = homeworkStore.getByDate(date)
  const done = items.filter((item) => item.status === 'done').length
  const doing = items.filter((item) => item.status === 'doing').length
  const todo = items.length - done - doing
  return {
    date,
    total: items.length,
    done,
    doing,
    todo,
    doneRate: items.length ? Math.round((done / items.length) * 100) : 0,
    actualMinutes: items.reduce((sum, item) => sum + (item.actualMinutes ?? 0), 0),
    pending: items
      .filter((item) => item.status !== 'done')
      .map((item) => ({ id: item.id, subject: item.subject, title: item.title, status: item.status })),
  }
}

/** 作业数据 REST API，结构化字段与前端 HomeworkItem 类型保持一致 */
export function homeworkRouter() {
  const router = Router()

  /** GET /api/homework?date=YYYY-MM-DD：按日期查询；不带 date 返回全部数据 */
  router.get('/', (req, res) => {
    const date = req.query.date
    if (typeof date === 'string' && date) {
      if (!DATE_RE.test(date)) {
        res.status(400).json({ ok: false, message: 'date 需为 YYYY-MM-DD 格式' })
        return
      }
      res.json({ ok: true, date, items: homeworkStore.getByDate(date) })
      return
    }
    res.json({ ok: true, data: homeworkStore.getAll() })
  })

  /** GET /api/homework/summary?date=YYYY-MM-DD：当日完成情况统计 */
  router.get('/summary', (req, res) => {
    const date = resolveDate(req.query.date)
    res.json({ ok: true, summary: toDailySummary(date) })
  })

  /** POST /api/homework：新增一项作业 */
  router.post('/', (req, res) => {
    const body = req.body ?? {}
    const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!subject || !title) {
      res.status(400).json({ ok: false, message: 'subject 和 title 都不能为空' })
      return
    }
    const status = typeof body.status === 'string' && STATUSES.has(body.status) ? body.status : 'todo'
    const now = Date.now()
    const item = {
      id: uid('hw'),
      date: resolveDate(body.date),
      subject,
      title,
      status,
      estimatedMinutes: finiteMinutes(body.estimatedMinutes),
      actualMinutes: finiteMinutes(body.actualMinutes),
      note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined,
      createdAt: now,
      updatedAt: now,
    }
    homeworkStore.insert(item)
    res.status(201).json({ ok: true, item })
  })

  /** PATCH /api/homework/:id：局部更新 */
  router.patch('/:id', (req, res) => {
    const existing = homeworkStore.findById(req.params.id)
    if (!existing) {
      res.status(404).json({ ok: false, message: `没有找到 id 为 ${req.params.id} 的作业` })
      return
    }
    const body = req.body ?? {}
    const changes = {}
    if (typeof body.subject === 'string' && body.subject.trim()) changes.subject = body.subject.trim()
    if (typeof body.title === 'string' && body.title.trim()) changes.title = body.title.trim()
    if (typeof body.status === 'string' && STATUSES.has(body.status)) changes.status = body.status
    if (body.estimatedMinutes !== undefined) changes.estimatedMinutes = finiteMinutes(body.estimatedMinutes)
    if (body.actualMinutes !== undefined) changes.actualMinutes = finiteMinutes(body.actualMinutes)
    if (typeof body.note === 'string') changes.note = body.note.trim() || undefined
    if (typeof body.date === 'string' && DATE_RE.test(body.date)) changes.date = body.date

    if (!Object.keys(changes).length) {
      res.status(400).json({ ok: false, message: '没有给出要修改的内容' })
      return
    }
    const item = homeworkStore.patch(req.params.id, changes)
    res.json({ ok: true, item })
  })

  /** DELETE /api/homework/:id：删除 */
  router.delete('/:id', (req, res) => {
    const removed = homeworkStore.remove(req.params.id)
    if (!removed) {
      res.status(404).json({ ok: false, message: `没有找到 id 为 ${req.params.id} 的作业` })
      return
    }
    res.json({ ok: true, removed })
  })

  return router
}
