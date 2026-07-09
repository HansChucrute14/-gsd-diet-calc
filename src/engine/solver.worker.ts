import { runSolver } from './solver'
import type { SolverInput, SolverOutput } from './solver'

export interface WorkerRequest {
  type: 'solve'
  payload: SolverInput
}

export interface WorkerSuccess {
  type: 'done'
  payload: SolverOutput
}

export interface WorkerError {
  type: 'error'
  error: string
}

export type WorkerResponse = WorkerSuccess | WorkerError

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { type, payload } = e.data

  if (type !== 'solve') {
    const resp: WorkerError = { type: 'error', error: `Unknown message type: ${type}` }
    self.postMessage(resp)
    return
  }

  try {
    const result = runSolver(payload)
    const resp: WorkerSuccess = { type: 'done', payload: result }
    self.postMessage(resp)
  } catch (err) {
    const resp: WorkerError = { type: 'error', error: String(err) }
    self.postMessage(resp)
  }
}
