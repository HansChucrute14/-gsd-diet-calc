import type { SolverInput, SolverOutput } from './solver'
import type { WorkerRequest, WorkerResponse } from './solver.worker'

const POOL_SIZE = 2

export interface WorkerHandle {
  worker: Worker
  busy: boolean
}

export class WorkerPool {
  private handles: WorkerHandle[] = []
  private workerUrl: string

  constructor(workerUrl?: string) {
    this.workerUrl = workerUrl ?? new URL('./solver.worker', import.meta.url).href
  }

  get size(): number {
    return this.handles.length
  }

  get available(): number {
    return this.handles.filter(h => !h.busy).length
  }

  private acquire(): WorkerHandle | null {
    const free = this.handles.find(h => !h.busy)
    if (free) {
      free.busy = true
      return free
    }
    if (this.handles.length < POOL_SIZE) {
      const worker = new Worker(this.workerUrl, { type: 'module' })
      const handle: WorkerHandle = { worker, busy: true }
      this.handles.push(handle)
      return handle
    }
    return null
  }

  private release(handle: WorkerHandle): void {
    handle.busy = false
  }

  solve(input: SolverInput): Promise<SolverOutput> {
    return new Promise((resolve, reject) => {
      const handle = this.acquire()
      if (!handle) {
        reject(new Error('No available worker in pool'))
        return
      }

      const onMessage = (e: MessageEvent<WorkerResponse>) => {
        handle.worker.removeEventListener('message', onMessage)
        handle.worker.removeEventListener('error', onError)
        this.release(handle)

        const resp = e.data
        if (resp.type === 'done') {
          resolve(resp.payload)
        } else {
          reject(new Error(resp.error))
        }
      }

      const onError = (err: ErrorEvent) => {
        handle.worker.removeEventListener('message', onMessage)
        handle.worker.removeEventListener('error', onError)
        this.release(handle)
        reject(new Error(err.message))
      }

      handle.worker.addEventListener('message', onMessage)
      handle.worker.addEventListener('error', onError)

      const req: WorkerRequest = { type: 'solve', payload: input }
      handle.worker.postMessage(req)
    })
  }

  terminate(): void {
    for (const h of this.handles) {
      h.worker.terminate()
    }
    this.handles = []
  }
}
