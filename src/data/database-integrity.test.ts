import { describe, it, expect } from 'vitest'
import { INGREDIENTS, STAGES } from './loaders'

describe('Database integrity — pipeline load', () => {

  it('INGREDIENTS carregados: estrutura essencial presente e sem duplicatas', () => {
    expect(INGREDIENTS.length).toBeGreaterThan(0)
    const ids = new Set<string>()
    for (const ing of INGREDIENTS) {
      expect(typeof ing.id).toBe('string')
      expect(ing.id.length).toBeGreaterThan(0)
      expect(ids.has(ing.id)).toBe(false)
      ids.add(ing.id)
      expect(typeof ing.kcal_per_100g).toBe('number')
      expect(Number.isFinite(ing.kcal_per_100g)).toBe(true)
      expect(ing.per_100g_as_fed).toBeTruthy()
      expect(typeof ing.per_100g_as_fed).toBe('object')
      expect(ing.lp_constraints).toBeTruthy()
      expect(typeof ing.lp_constraints.max_inclusion_pct).toBe('number')
      expect(typeof ing.lp_constraints.min_inclusion_pct).toBe('number')
    }
    expect(ids.size).toBe(INGREDIENTS.length)
  })

  it('STAGES carregados: estrutura essencial presente', () => {
    expect(STAGES.length).toBeGreaterThan(0)
    for (const stage of STAGES) {
      expect(typeof stage.stage_id).toBe('string')
      expect(stage.stage_id.length).toBeGreaterThan(0)
      expect(Array.isArray(stage.targets)).toBe(true)
      expect(stage.targets.length).toBeGreaterThan(0)
    }
  })

  it('INGREDIENTS têm per_100g_as_fed com campos de macronutrientes na maioria', () => {
    const withProtein = INGREDIENTS.filter(i => typeof i.per_100g_as_fed.protein_g === 'number')
    const withFat = INGREDIENTS.filter(i => typeof i.per_100g_as_fed.fat_g === 'number')
    expect(withProtein.length).toBeGreaterThan(INGREDIENTS.length * 0.5)
    expect(withFat.length).toBeGreaterThan(INGREDIENTS.length * 0.5)
  })
})
