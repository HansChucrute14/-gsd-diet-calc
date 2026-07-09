/**
 * loaders.ts
 * Runtime loaders for the generated ingredient and stage data.
 * The JSON files are produced by: npm run reconcile
 * Vite's resolveJsonModule handles the import at build time.
 */

import type { IngredientDisplayData } from '../types'
import type { RawStage } from '../engine/targets'
import { NUTRIENT_REGISTRY } from './nutrientRegistry'

// These imports resolve after `npm run reconcile` has been run.
// Vite bundles them as static JSON at build time.
import _ingredients from './generated/ingredients.json'
import _stages from './generated/stages.json'

/** Minimal structural validation: checks that critical fields exist and have the right shape.
 *  Full Zod.parse is too strict for the reconciled JSON (categorical strings, optional metadata).
 *  This catches catastrophic issues (e.g. empty array, missing ids) without false positives. */
function validateIngredients(raw: unknown): IngredientDisplayData[] {
  if (!Array.isArray(raw)) {
    console.warn('[loaders] ingredients.json: not an array — usando fallback cru.')
    return raw as IngredientDisplayData[]
  }
  const warnings: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown>
    if (!item || typeof item !== 'object') {
      warnings.push(`ingredients.json[${i}]: não é objeto — ignorado`)
      continue
    }
    if (typeof item.id !== 'string' || !item.id) {
      warnings.push(`ingredients.json[${i}]: id inválido — ignorado`)
      continue
    }
    if (typeof item.kcal_per_100g !== 'number') {
      warnings.push(`ingredients.json[${i}] (${item.id}): kcal_per_100g não é número`)
    }
    if (!item.per_100g_as_fed || typeof item.per_100g_as_fed !== 'object') {
      warnings.push(`ingredients.json[${i}] (${item.id}): per_100g_as_fed ausente`)
    }
    const paf = item.per_100g_as_fed as Record<string, unknown>
    const missingKeys = Object.values(NUTRIENT_REGISTRY)
      .filter(def => !(def.raw_field_key in paf))
      .map(def => `${def.id} (${def.raw_field_key})`)
    if (missingKeys.length > 0) {
      warnings.push(`ingredients.json[${i}] (${item.id}): raw_field_keys ausentes: ${missingKeys.join(', ')}`)
    }
  }
  if (warnings.length > 0) {
    console.warn('[loaders] Validação de ingredientes:\n' + warnings.map(w => '  - ' + w).join('\n'))
  }
  return raw as IngredientDisplayData[]
}

function parseStages(raw: unknown): RawStage[] {
  if (!Array.isArray(raw)) {
    console.warn('[loaders] stages.json: not an array — typing as-is.')
    return raw as RawStage[]
  }
  return raw as RawStage[]
}

export const INGREDIENTS: IngredientDisplayData[] = validateIngredients(_ingredients)
export const STAGES: RawStage[] = parseStages(_stages)

export function getIngredientById(id: string): IngredientDisplayData | undefined {
  return INGREDIENTS.find(i => i.id === id)
}

export function getStageById(stageId: string): RawStage | undefined {
  return STAGES.find(s => s.stage_id === stageId)
}

export function getStageForProfile(ageMonths: number, isWorking = false): RawStage | undefined {
  if (isWorking && ageMonths >= 18) {
    return STAGES.find(s => s.stage_id === 'working_adult')
  }
  return STAGES.find(s => {
    const min = s.age_months_min ?? 0
    const max = s.age_months_max ?? 999
    return ageMonths >= min && ageMonths <= max && s.stage_id !== 'working_adult'
  })
}
