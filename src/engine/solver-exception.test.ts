import { vi, describe, it, expect } from 'vitest'

vi.mock('javascript-lp-solver', () => ({
  default: {
    Solve: vi.fn(() => { throw new Error('LP solver crashed') }),
  },
}))

import { runSolver } from './solver'
import type { ResolvedStageTargets } from './targets'
import type { IngredientDisplayData } from '../types'

function makeIng(id: string): IngredientDisplayData {
  return {
    id,
    name: id,
    category: 'muscle_meat',
    kcal_per_100g: 150,
    per_100g_as_fed: { protein_g: 20 },
    lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
  } as IngredientDisplayData
}

describe('Solver exception handling', () => {
  it('solver.Solve() lança → solver_status=error + solver_message + warning + sem allocations', () => {
    const resolved: ResolvedStageTargets = {
      stage_id: 'test', der_kcal: 1000, targets: [],
    }
    const result = runSolver({
      ingredients: [makeIng('a')],
      resolvedTargets: resolved,
      dogProfileId: 'test',
    })
    expect(result.formulation.solver_status).toBe('error')
    expect(result.formulation.solver_message).toBeTruthy()
    expect(result.formulation.reconciliation_warnings.some(
      w => w.includes('LP solver crashed'),
    )).toBe(true)
    expect(result.formulation.allocations).toEqual([])
    expect(result.formulation.total_grams_per_day).toBe(0)
  })
})
