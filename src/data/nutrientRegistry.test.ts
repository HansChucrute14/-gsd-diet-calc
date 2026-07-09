import { describe, it, expect } from 'vitest'
import { NUTRIENT_REGISTRY } from './nutrientRegistry'
import { INGREDIENTS } from './loaders'

describe('Nutrient Registry', () => {
  it('tem exatamente 38 entradas', () => {
    expect(Object.keys(NUTRIENT_REGISTRY).length).toBe(38)
  })

  it('todos os raw_field_key existem literalmente em pelo menos 1 ingrediente do banco real', () => {
    for (const nutrient of Object.values(NUTRIENT_REGISTRY)) {
      const exists = INGREDIENTS.some(ing => nutrient.raw_field_key in ing.per_100g_as_fed)
      expect(exists).toBe(true)
    }
  })

  it('cada entrada tem unit_canonical válido', () => {
    for (const nutrient of Object.values(NUTRIENT_REGISTRY)) {
      expect(['g', 'mg', 'ug', 'IU']).toContain(nutrient.unit_canonical)
    }
  })

  it('cada entrada tem clinical_criticality válido', () => {
    for (const nutrient of Object.values(NUTRIENT_REGISTRY)) {
      expect(['critical', 'important', 'desirable']).toContain(nutrient.clinical_criticality)
    }
  })
})
