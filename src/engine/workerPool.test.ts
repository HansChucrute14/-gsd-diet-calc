// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { WorkerPool } from './workerPool'

function makeMockWorker(_url: string | URL, _opts?: WorkerOptions): Worker {
  const listeners: { [type: string]: Array<EventListenerOrEventListenerObject> } = {}
  return {
    postMessage(msg: unknown) {
      setTimeout(() => {
        const cbs = listeners['message'] ?? []
        const event = new MessageEvent('message', { data: { type: 'done', payload: msg } })
        for (const cb of cbs) {
          if (typeof cb === 'function') cb(event)
          else cb.handleEvent(event)
        }
      }, 0)
    },
    terminate: vi.fn(),
    addEventListener: vi.fn((type, cb) => {
      if (!listeners[type]) listeners[type] = []
      listeners[type].push(cb)
    }),
    removeEventListener: vi.fn((type, cb) => {
      if (listeners[type]) listeners[type] = listeners[type].filter(c => c !== cb)
    }),
    dispatchEvent: vi.fn(() => true),
    onmessage: null,
    onmessageerror: null,
    onerror: null,
  } as unknown as Worker
}

const MINIMAL_INPUT = {
  ingredients: [{ id: 'chicken_breast', name: 'Peito de Frango', per_100g_as_fed: { protein: 31 }, category: 'meat', dry_matter_pct: 27 }],
  resolvedTargets: {
    dogProfileId: 'test',
    targets: [{ nutrient_id: 'protein', min_per_day: 50, max_per_day: 200, unit: 'g', weight: 1 }],
  },
  dogProfileId: 'test',
}

describe('WorkerPool', () => {
  it('resolve quando worker responde com done', async () => {
    const origWorker = globalThis.Worker
    globalThis.Worker = makeMockWorker as unknown as typeof Worker
    const pool = new WorkerPool('mock.js')
    const result = await pool.solve(MINIMAL_INPUT as never)
    expect(result).toBeDefined()
    globalThis.Worker = origWorker
  })

  it('terminate zera o pool', () => {
    const origWorker = globalThis.Worker
    globalThis.Worker = makeMockWorker as unknown as typeof Worker
    const pool = new WorkerPool('mock.js')
    pool.solve(MINIMAL_INPUT as never)
    pool.terminate()
    expect(pool.size).toBe(0)
    globalThis.Worker = origWorker
  })
})
