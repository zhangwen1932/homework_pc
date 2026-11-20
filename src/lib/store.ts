import { useSyncExternalStore } from 'react'
import type { HomeworkItem } from '../types'

type HomeworkDB = Record<string, HomeworkItem[]>

const EMPTY: HomeworkItem[] = []
const listeners = new Set<() => void>()

let nextId = 0
export function uid(prefix = 'id'): string {
  nextId += 1
  return `${prefix}_${Date.now().toString(36)}_${nextId}`
}

/** 前端内存缓存；真实数据源是后端 SQLite（/api/homework），写操作先落库再刷新缓存 */
let db: HomeworkDB = {}

function commit(next: HomeworkDB) {
  db = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  const payload: unknown = await res.json().catch(() => undefined)
  const ok = !!payload && typeof payload === 'object' && (payload as { ok?: boolean }).ok === true
  if (!res.ok || !ok) {
    const message =
      payload && typeof payload === 'object' ? (payload as { message?: string }).message : undefined
    throw new Error(message || `请求失败（HTTP ${res.status}）`)
  }
  return payload as T
}

export const homeworkStore = {
  subscribe,

  /** 读缓存（同步），需要最新数据时先调用 refreshDate */
  getByDate(date: string): HomeworkItem[] {
    return db[date] ?? EMPTY
  },

  /** 从后端拉取某一天的数据并刷新缓存；所有工具的读写都经过这里，保证界面与管理后台一致 */
  async refreshDate(date: string): Promise<HomeworkItem[]> {
    const { items } = await request<{ items: HomeworkItem[] }>(`/api/homework?date=${date}`)
    commit({ ...db, [date]: items })
    return items
  },

  /** 新增作业，后端生成 id，成功后刷新归属日期的缓存 */
  async insert(payload: Omit<HomeworkItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<HomeworkItem> {
    const { item } = await request<{ item: HomeworkItem }>('/api/homework', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    await homeworkStore.refreshDate(item.date)
    return item
  },

  async patch(id: string, changes: Partial<HomeworkItem>): Promise<HomeworkItem> {
    const { item } = await request<{ item: HomeworkItem }>(`/api/homework/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    })
    await homeworkStore.refreshDate(item.date)
    return item
  },

  async remove(id: string): Promise<HomeworkItem> {
    const { removed } = await request<{ removed: HomeworkItem }>(`/api/homework/${id}`, {
      method: 'DELETE',
    })
    await homeworkStore.refreshDate(removed.date)
    return removed
  },

  /** 清空全部：逐条删除后端数据（demo 数据量小，顺序删除即可） */
  async clearAll(): Promise<void> {
    const { data } = await request<{ data: HomeworkDB }>('/api/homework')
    const ids = Object.values(data ?? {}).flatMap((items) => items.map((item) => item.id))
    for (const id of ids) {
      await request(`/api/homework/${id}`, { method: 'DELETE' })
    }
    commit({})
  },
}

/** 订阅某一天的作业列表 */
export function useHomework(date: string): HomeworkItem[] {
  return useSyncExternalStore(subscribe, () => homeworkStore.getByDate(date))
}
