import { describe, it, expect } from 'vitest'
import { INGREDIENTS } from '../data/loaders'
import { IngredientDisplayDataSchemaV5 } from './index'

describe('F0.4 — Schema validation (IngredientDisplayDataSchemaV5 vs INGREDIENTS reais)', () => {
  const schema = IngredientDisplayDataSchemaV5

  it(`${INGREDIENTS.length} ingredientes carregados do catálogo`, () => {
    expect(INGREDIENTS.length).toBe(26)
  })

  it('documenta falhas estruturais entre dados reais e schema (decisão F3)', () => {
    const failures: Array<{ id: string; summary: string }> = []
    const errorPatterns = new Map<string, number>()

    for (const ing of INGREDIENTS) {
      const result = schema.safeParse(ing)
      if (!result.success) {
        const issues = result.error.issues.map(i =>
          `${i.path.join('.')}: ${i.code} — ${i.message}`
        )
        failures.push({ id: ing.id, summary: issues.join('; ') })
        for (const issue of result.error.issues) {
          const key = `${issue.code}@${issue.path.slice(0, -1).join('.')}`
          errorPatterns.set(key, (errorPatterns.get(key) ?? 0) + 1)
        }
      }
    }

    expect(failures.length).toBe(INGREDIENTS.length)
    expect(errorPatterns.has('too_small@')).toBe(true)
    expect(errorPatterns.has('invalid_type@bioavailability_factors')).toBe(true)
  })
})
