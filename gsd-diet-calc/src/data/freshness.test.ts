import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkDataFreshness } from './freshness'
import type { IngredientDisplayData } from '../types'

function makeIng(date: string | undefined): IngredientDisplayData {
  return {
    id: 'test',
    name: 'Test Ingredient',
    category: 'muscle_meat',
    kcal_per_100g: 150,
    per_100g_as_fed: { protein_g: 20 },
    lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    metadata: date ? { last_reviewed_date: date } : undefined,
  } as IngredientDisplayData
}

describe('checkDataFreshness', () => {
  afterEach(() => { vi.useRealTimers() })

  it('ingrediente com data > 365 dias atrás emite warning', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-09'))
    const result = checkDataFreshness([makeIng('2024-06-01')])
    expect(result).toHaveLength(1)
    expect(result[0].ingredient_id).toBe('test')
    expect(result[0].days_since_review).toBeGreaterThanOrEqual(365)
  })

  it('ingrediente com data recente não emite warning', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-09'))
    const result = checkDataFreshness([makeIng('2026-07-08')])
    expect(result).toHaveLength(0)
  })

  it('ingrediente sem metadata não emite warning', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-09'))
    const result = checkDataFreshness([makeIng(undefined)])
    expect(result).toHaveLength(0)
  })
})
