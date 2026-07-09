import type { IngredientDisplayData } from '../types'

export interface FreshnessWarning {
  ingredient_id: string
  ingredient_name: string
  last_reviewed_date: string
  days_since_review: number
}

export function checkDataFreshness(ingredients: IngredientDisplayData[], now?: Date): FreshnessWarning[] {
  const warnings: FreshnessWarning[] = []

  for (const ing of ingredients) {
    const dateStr = ing.metadata?.last_reviewed_date
    if (!dateStr) continue
    const parsed = new Date(dateStr)
    if (isNaN(parsed.getTime())) continue
    const days = Math.floor(((now ?? new Date()).getTime() - parsed.getTime()) / 86400000)
    if (days > 365) {
      warnings.push({
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        last_reviewed_date: dateStr,
        days_since_review: days,
      })
    }
  }

  return warnings
}
