/**
 * engine/index.ts
 * Public API for the diet formulation engine.
 */

export { computeBiometry, bcsLabel, lifeStageLabel } from './biometry'
export { resolveTargets, rawStageToRequirementStage, getNutrientPerGram } from './targets'
export { runSolver, wrapOptimizeResult } from './solver'

import { computeBiometry } from './biometry'
import { resolveTargets } from './targets'
import { runSolver } from './solver'
import { getStageForProfile } from '../data/loaders'
import type { DogProfile, Formulation, FormulationMode } from '../types'
import type { IngredientDisplayData } from '../types'

export interface FormulateInput {
  profile: DogProfile
  ingredients: IngredientDisplayData[]
  minGramsPerDay?: number
  maxGramsPerDay?: number
  mode?: FormulationMode
}

export interface FormulateResult {
  formulation: Formulation
  der_kcal: number
  rer_kcal: number
  stage_id: string
}

/**
 * Main entry point: profile + ingredient selection → complete formulation.
 */
export function formulate(input: FormulateInput): FormulateResult {
  const { profile, ingredients, mode } = input

  if (!ingredients || ingredients.length === 0) {
    throw new Error('Nenhum ingrediente selecionado para formulação.')
  }

  // Step 1: Biometry
  const biometry = computeBiometry(profile)

  // Step 2: Find matching requirement stage
  const isWorking = profile.activity_level === 'working' || profile.activity_level === 'performance'
  const rawStage = getStageForProfile(profile.age_months, isWorking)

  if (!rawStage) {
    throw new Error(`Nenhum estágio nutricional encontrado para idade ${profile.age_months} meses.`)
  }

  // Step 3: Convert density targets → absolute daily targets
  const resolvedTargets = resolveTargets(rawStage, biometry.der_kcal)

  // Step 4: Solve LP
  const { formulation } = runSolver({
    ingredients,
    resolvedTargets,
    dogProfileId: profile.id,
    minGramsPerDay: input.minGramsPerDay,
    maxGramsPerDay: input.maxGramsPerDay,
    mode,
  })

  return {
    formulation,
    der_kcal: biometry.der_kcal,
    rer_kcal: biometry.rer_kcal,
    stage_id: biometry.stage_id,
  }
}
