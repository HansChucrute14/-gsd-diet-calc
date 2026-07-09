/**
 * solver.ts — v6 goal-programming
 * Linear-programming diet formulation using javascript-lp-solver.
 *
 * Decision variables: x_i = grams/day of ingredient i  (x_i ≥ 0 implicitly)
 *
 * Constraints (v6-aligned):
 *   1. Total kcal/day ≈ DER ± 3% (Seção 6.1) when der_kcal is set
 *   2. Total grams/day in [minTotal, maxTotal] (bounds derived from DER/energy_density when possible)
 *   3. Nutrient min/max per day — goal-programming with slack variables (v6 §6)
 *   4. Per-ingredient absolute max grams (x_i ≤ max_pct × maxTotal)
 *   5. Energy density linearised on allocated mass (Seção 5):
 *        Σ(kcal_i − edMin)·x_i ≥ 0 ; Σ(kcal_i − edMax)·x_i ≤ 0
 *   6. Ca:P ratio linearised: Ca_day - ratio × P_day ≥/≤ 0
 *
 * Objective (goal programming v6 §6):
 *   minimise Σ weight_criticality × (sl_under + sl_over) + 0.001 × cost
 *   Nutritional deviation minimised first; ingredient cost is tiebreaker.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — no type declarations for javascript-lp-solver
import solverModule from 'javascript-lp-solver'
// Prevent "Cannot redefine property: lastSolvedModel" on repeated solves.
// javascript-lp-solver sets `this.lastSolvedModel = model` inside Solve(),
// which throws when the ESM proxy prevents redefinition. We bind Solve to
// a fresh object whose lastSolvedModel is writable.
const solverCtx = { lastSolvedModel: undefined }
const solver = { ...solverModule, Solve: solverModule.Solve.bind(solverCtx) }

import type { IngredientDisplayData, Formulation, NutrientResult, DryRunResult, OptimizeResult, FormulationMode, IngredientSuggestion } from '../types'
import { CRITICALITY_WEIGHT } from '../types'
import type { ResolvedStageTargets } from './targets'
import { getNutrientPerGram, nutrientHasCoverage } from './targets'
import { NUTRIENT_REGISTRY } from '../data/nutrientRegistry'
import { INGREDIENTS } from '../data/loaders'

const CA_MOLAR = 40.078
const ZN_MOLAR = 65.38
const CA_ZN_MOLAR_LIMIT = 150

export interface SolverInput {
  ingredients: IngredientDisplayData[]
  resolvedTargets: ResolvedStageTargets
  dogProfileId: string
  minGramsPerDay?: number
  maxGramsPerDay?: number
  mode?: FormulationMode
}

function suggestMissingIngredients(
  targets: ResolvedStageTargets['targets'],
  selectedIds: Set<string>,
): IngredientSuggestion[] {
  const maxTotalGrams = 2000
  const suggestions: IngredientSuggestion[] = []
  for (const t of targets) {
    if (t.min_per_day === undefined) continue
    let maxPossible = 0
    for (const ing of INGREDIENTS) {
      if (!selectedIds.has(ing.id)) continue
      const pct = ing.lp_constraints.max_inclusion_pct ?? 100
      const maxGrams = (pct / 100) * maxTotalGrams
      maxPossible += maxGrams * getNutrientPerGram(ing.per_100g_as_fed, t.nutrient_id)
    }
    if (maxPossible >= t.min_per_day * 0.95) continue
    const candidates = INGREDIENTS
      .filter(ing => !selectedIds.has(ing.id))
      .map(ing => ({
        ingredient_id: ing.id,
        amount: getNutrientPerGram(ing.per_100g_as_fed, t.nutrient_id) *
                ((ing.lp_constraints.max_inclusion_pct / 100) * maxTotalGrams),
      }))
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)
    for (const c of candidates) {
      suggestions.push({
        ingredient_id: c.ingredient_id,
        reason_nutrient_id: t.nutrient_id,
        shortfall_amount: Math.round((t.min_per_day - maxPossible) * 1000) / 1000,
      })
    }
  }
  return suggestions
}

export interface SolverOutput {
  formulation: Formulation
}

function varName(id: string): string {
  return `v_${id.replace(/[^a-zA-Z0-9]/g, '_')}`
}

function nutrientPerGramForIng(
  ing: IngredientDisplayData,
  nutrientId: string,
): number {
  return getNutrientPerGram(
    ing.per_100g_as_fed,
    nutrientId,
    ing.bioavailability_factors ?? null,
  )
}

/**
 * dryRunValidation (v6 §6.2)
 * Checks nutrient coverage across an ENTIRE catalog (not just selected ingredients).
 * Returns DryRunResult with missing (zero coverage), insufficient (can't hit min),
 * and excluded (subset removed from active constraints) lists.
 */
export function dryRunValidation(
  targets: ResolvedStageTargets['targets'],
  catalog: Array<{ per_100g_as_fed: Record<string, number | null | undefined>; lp_constraints?: { max_inclusion_pct?: number } }>,
): DryRunResult {
  const missing: string[] = []
  const insufficient: string[] = []
  const maxTotalGrams = 2000

  for (const t of targets) {
    const hasData = nutrientHasCoverage(t.nutrient_id, catalog)
    if (!hasData) {
      missing.push(t.nutrient_id)
      continue
    }
    if (t.min_per_day !== undefined) {
      let maxPossible = 0
      for (const ing of catalog) {
        const pct = ing.lp_constraints?.max_inclusion_pct ?? 100
        const maxGrams = (pct / 100) * maxTotalGrams
        maxPossible += maxGrams * getNutrientPerGram(ing.per_100g_as_fed, t.nutrient_id)
      }
      if (maxPossible < t.min_per_day * 0.95) {
        insufficient.push(t.nutrient_id)
      }
    }
  }

  return {
    valid: missing.length === 0 && insufficient.length === 0,
    missing_nutrients: missing,
    insufficient_nutrients: insufficient,
    excluded_from_this_run: [...missing],
  }
}

export function runSolver(input: SolverInput): SolverOutput {
  let { ingredients, resolvedTargets, dogProfileId } = input
  const mode: FormulationMode = input.mode ?? 'livre'
  // Deduplicate ingredients by ID (v6 §6.5) — keep first occurrence, warn on duplicates
  const seenIds = new Set<string>()
  const deduped: typeof ingredients = []
  for (const ing of ingredients) {
    if (seenIds.has(ing.id)) {
      console.warn(`[solver] ID duplicado ignorado: ${ing.id}`)
    } else {
      seenIds.add(ing.id)
      deduped.push(ing)
    }
  }
  ingredients = deduped
  const der = resolvedTargets.der_kcal
  const ed = resolvedTargets.energy_density_constraint

  // Mass bounds: prefer DER/energy_density envelope over fixed 200–1500g (v6 §6.1)
  let minTotal = input.minGramsPerDay
  let maxTotal = input.maxGramsPerDay
  if (minTotal === undefined || maxTotal === undefined) {
    if (der > 0 && ed && ed.min > 0 && ed.max > 0) {
      // grams ≈ kcal / (kcal/g) → [der/edMax, der/edMin] with slack
      minTotal = minTotal ?? Math.max(50, (der / ed.max) * 0.7)
      maxTotal = maxTotal ?? Math.min(3000, (der / ed.min) * 1.3)
    } else {
      minTotal = minTotal ?? 200
      maxTotal = maxTotal ?? 1500
    }
  }

  type LpVar = Record<string, number>
  const variables: Record<string, LpVar> = {}
  const constraints: Record<string, { min?: number; max?: number }> = {}
  const coverageExcluded: string[] = []
  const warnings: string[] = []

  // ── Objective (goal programming v6 §6) ────────────────────────────────────
  // Primary: minimizar Σ weight_criticality × (sl_under + sl_over)
  // Secondary (tiebreaker): ε × ingredient_cost, ε = 0.001
  for (const ing of ingredients) {
    const vn = varName(ing.id)
    const pricePerG = ing.price_per_kg ? ing.price_per_kg.value / 1000 : 0.025
    const palPenalty = ing.palatability_and_feasibility
      ? 0.001 * (10 - ing.palatability_and_feasibility.score)
      : 0.005
    variables[vn] = { cost: (pricePerG + palPenalty) * 0.001 }
  }

  // ── Total grams constraint ───────────────────────────────────────────────
  // Σx_i ∈ [minTotal, maxTotal]
  for (const ing of ingredients) {
    variables[varName(ing.id)]['total'] = 1
  }
  constraints['total'] = { min: minTotal, max: maxTotal }
  // Slack total grams — livre mode: ingredients with low max_inclusion_pct may
  // not reach minTotal, so slack keeps the solver feasible.
  if (mode === 'livre') {
    variables['sl_total_under'] = { cost: 100, total: 1 }
    variables['sl_total_over']  = { cost: 100, total: -1 }
  }

  // ── DER calorie anchor (v6 §6.1) ──────────────────────────────────────────
  // Σ(kcal_per_g · x_i) ∈ [der×0.97, der×1.03]
  if (der && der > 0) {
    const KCAL_TOLERANCE = 0.03
    for (const ing of ingredients) {
      const kcalPerG = (ing.kcal_per_100g ?? 0) / 100
      variables[varName(ing.id)]['der_kcal'] =
        (variables[varName(ing.id)]['der_kcal'] ?? 0) + kcalPerG
    }
    constraints['der_kcal'] = {
      min: der * (1 - KCAL_TOLERANCE),
      max: der * (1 + KCAL_TOLERANCE),
    }
  }

  // Slack — DER (v6.7): soft constraint via penalty (livre mode only)
  if (der && der > 0) {
    const slackActive = mode === 'livre'
    if (slackActive) {
      variables['sl_der_under'] = { cost: 100, der_kcal: 1 }
      variables['sl_der_over']  = { cost: 100, der_kcal: -1 }
    }
  }

  // ── Nutrient constraints (goal programming + CoverageGate) ───────────────
  // v6 §6: for each target, add slack variables sl_under (min) and sl_over (max)
  // with cost = weight_criticality, so solver minimises nutritional deviation first.
  for (const t of resolvedTargets.targets) {
    const cKey = `nut_${t.nutrient_id}`

    // Soft CoverageGate (selected set): skip constraint if no contribution
    // Full-catalog CoverageGate (dryRunValidation) is a separate pre-solve step.
    if (!nutrientHasCoverage(t.nutrient_id, ingredients)) {
      coverageExcluded.push(t.nutrient_id)
      warnings.push(`Nutriente '${t.nutrient_id}' sem cobertura nos ingredientes selecionados — restrição omitida.`)
      continue
    }

    for (const ing of ingredients) {
      const perG = nutrientPerGramForIng(ing, t.nutrient_id)
      if (perG > 0) {
        variables[varName(ing.id)][cKey] = (variables[varName(ing.id)][cKey] ?? 0) + perG
      }
    }
    if (t.min_per_day !== undefined || t.max_per_day !== undefined) {
      constraints[cKey] = {}
      if (t.min_per_day !== undefined) constraints[cKey].min = t.min_per_day
      if (t.max_per_day !== undefined) constraints[cKey].max = t.max_per_day
    }

    // Goal-programming slack variables:
    // sl_under_{id} : softens min constraint at cost = weight_criticality
    // sl_over_{id}  : softens max constraint at cost = weight_criticality
    // Mode 'livre': all nutrients get slack (ensures solver always finds solution)
    // Mode 'otimo': only desirable nutrients get slack; safety ceilings always hard
    const def = NUTRIENT_REGISTRY[t.nutrient_id]
    const weight = def ? (CRITICALITY_WEIGHT[def.clinical_criticality] ?? 1) : 1
    if (mode === 'livre') {
      if (t.min_per_day !== undefined) {
        variables[`sl_under_${t.nutrient_id}`] = { cost: weight, [cKey]: 1 }
      }
      if (t.max_per_day !== undefined) {
        variables[`sl_over_${t.nutrient_id}`] = { cost: weight, [cKey]: -1 }
      }
    } else {
      // mode === 'otimo': only desirable gets slack; safety ceilings always hard
      if (t.min_per_day !== undefined && def?.clinical_criticality === 'desirable') {
        variables[`sl_under_${t.nutrient_id}`] = { cost: weight, [cKey]: 1 }
      }
      if (t.max_per_day !== undefined) {
        const isSafetyCeiling = def?.has_safety_ceiling === true
        if (!isSafetyCeiling && def?.clinical_criticality === 'desirable') {
          variables[`sl_over_${t.nutrient_id}`] = { cost: weight, [cKey]: -1 }
        }
      }
    }
  }

  // ── Per-ingredient upper bound (max inclusion %) ─────────────────────────
  // x_i ≤ max_pct × maxTotal  (conservative: uses maxTotal as reference)
  // This is an absolute gram cap, not a relative % cap — % is recalculated post-solve.
  for (const ing of ingredients) {
    const vn = varName(ing.id)
    const maxGrams = (ing.lp_constraints.max_inclusion_pct / 100) * maxTotal
    if (maxGrams < maxTotal) {
      const capKey = `cap_${vn}`
      variables[vn][capKey] = 1
      constraints[capKey] = { max: maxGrams }
    }
    // min_inclusion_pct > 0 (mandatory ingredients)
    if (ing.lp_constraints.min_inclusion_pct > 0) {
      const minGrams = (ing.lp_constraints.min_inclusion_pct / 100) * minTotal
      const floorKey = `floor_${vn}`
      variables[vn][floorKey] = 1
      constraints[floorKey] = { min: minGrams }
    }
  }

  // ── Energy density (v6 §5) — linearised on allocated mass ─────────────────
  // Σ(kcal_i − edMin)·x_i ≥ 0  and  Σ(kcal_i − edMax)·x_i ≤ 0
  if (ed) {
    const { min: edMin, max: edMax } = ed
    for (const ing of ingredients) {
      const kcalPerG = (ing.kcal_per_100g ?? 0) / 100
      const vn = varName(ing.id)
      variables[vn]['ed_min'] = (variables[vn]['ed_min'] ?? 0) + (kcalPerG - edMin)
      variables[vn]['ed_max'] = (variables[vn]['ed_max'] ?? 0) + (kcalPerG - edMax)
    }
    constraints['ed_min'] = { min: 0 }
    constraints['ed_max'] = { max: 0 }
  }

  // Slack — Energy density (v6.7): soft constraint via penalty (livre mode only)
  if (mode === 'livre' && ed) {
    variables['sl_ed_min'] = { cost: 50, ed_min: 1 }
    variables['sl_ed_max'] = { cost: 50, ed_max: -1 }
  }

  // ── Ca:P ratio constraint ─────────────────────────────────────────────────
  const caP = resolvedTargets.ratio_constraints?.find(r => r.nutrient_id === 'calcium_phosphorus_ratio')
  if (caP) {
    const caHasCoverage = nutrientHasCoverage('calcium', ingredients)
    const pHasCoverage = nutrientHasCoverage('phosphorus', ingredients)
    if (!caHasCoverage || !pHasCoverage) {
      coverageExcluded.push('calcium_phosphorus_ratio')
    } else {
      for (const ing of ingredients) {
        const vn = varName(ing.id)
        const caPerG = nutrientPerGramForIng(ing, 'calcium')
        const pPerG  = nutrientPerGramForIng(ing, 'phosphorus')
        if (caP.min_ratio !== undefined) {
          const coeff = caPerG - caP.min_ratio * pPerG
          if (coeff !== 0) variables[vn]['cap_min'] = (variables[vn]['cap_min'] ?? 0) + coeff
        }
        if (caP.max_ratio !== undefined) {
          const coeff = caPerG - caP.max_ratio * pPerG
          if (coeff !== 0) variables[vn]['cap_max'] = (variables[vn]['cap_max'] ?? 0) + coeff
        }
      }
      if (caP.min_ratio !== undefined) constraints['cap_min'] = { min: 0 }
      if (caP.max_ratio !== undefined) constraints['cap_max'] = { max: 0 }
      // Slack — Ca:P ratio (v6.7) — livre mode only
      if (mode === 'livre' && caP.min_ratio !== undefined) variables['sl_cap_min'] = { cost: 50, cap_min: 1 }
      if (mode === 'livre' && caP.max_ratio !== undefined) variables['sl_cap_max'] = { cost: 50, cap_max: -1 }
    }
  }

  // ── Solve ────────────────────────────────────────────────────────────────
  // Deep-clone model: javascript-lp-solver mutates the model object
  // (adds non-configurable lastSolvedModel property), preventing re-use.
  const model = JSON.parse(JSON.stringify({
    optimize: 'cost',
    opType: 'min',
    constraints,
    variables,
  }))

  let result: Record<string, unknown>
  let feasible = false
  let solverStatus: Formulation['solver_status'] = 'infeasible'
  let suggestedIngredients: IngredientSuggestion[] = []
  try {
    result = solver.Solve(model)
    feasible = (result.feasible as boolean | undefined) === true
    solverStatus = feasible ? 'optimal' : 'infeasible'
  } catch (err) {
    warnings.push(`Solver exception: ${err instanceof Error ? err.message : String(err)}`)
    solverStatus = 'error'
    result = {}
  }

  if (!feasible && mode === 'otimo') {
    suggestedIngredients = suggestMissingIngredients(
      resolvedTargets.targets,
      new Set(ingredients.map(i => i.id)),
    )
  }

  // ── Extract solution ─────────────────────────────────────────────────────
  const gramsMap: Record<string, number> = {}
  let totalGrams = 0
  let totalKcal  = 0

  for (const ing of ingredients) {
    const raw = feasible ? ((result[varName(ing.id)] as number | undefined) ?? 0) : 0
    const grams = Math.max(0, raw)   // clamp negatives (shouldn't occur now but defensive)
    gramsMap[ing.id] = grams
    totalGrams += grams
    const kcal100 = ing.kcal_per_100g ?? 0
    if (kcal100 === 0 && grams > 0.5) {
      warnings.push(`${ing.name}: kcal_per_100g ausente ou zero — contribuição calórica ignorada.`)
    }
    totalKcal  += grams * (kcal100 / 100)
  }

  const allocations: Formulation['allocations'] = []
  for (const ing of ingredients) {
    const grams = gramsMap[ing.id]
    if (grams <= 0) continue
    allocations.push({
      ingredient_id: ing.id,
      grams_per_day: Math.round(grams * 10) / 10,
      pct_of_diet: totalGrams > 0 ? Math.round((grams / totalGrams) * 1000) / 10 : 0,
      kcal_contribution: Math.round(grams * ((ing.kcal_per_100g ?? 0) / 100) * 10) / 10,
    })
  }
  allocations.sort((a, b) => b.grams_per_day - a.grams_per_day)

  // ── Nutrient results ─────────────────────────────────────────────────────
  const nutrientResults: NutrientResult[] = []
  const achieved: Record<string, number> = {}
  const coveragePct: Record<string, number> = {}

  for (const nutrientId of Object.keys(NUTRIENT_REGISTRY)) {
    let totalAmount = 0
    for (const ing of ingredients) {
      totalAmount += gramsMap[ing.id] * nutrientPerGramForIng(ing, nutrientId)
    }
    achieved[nutrientId] = totalAmount

    const target  = resolvedTargets.targets.find(t => t.nutrient_id === nutrientId)
    const unitDef = NUTRIENT_REGISTRY[nutrientId]

    let status: NutrientResult['status'] = 'unchecked'
    let pct_of_min: number | undefined
    let pct_of_max: number | undefined

    if (target) {
      if (target.min_per_day !== undefined && target.min_per_day > 0) {
        pct_of_min = Math.round((totalAmount / target.min_per_day) * 100)
      }
      if (target.max_per_day !== undefined && target.max_per_day > 0) {
        pct_of_max = Math.round((totalAmount / target.max_per_day) * 100)
      }
      const belowMin = target.min_per_day !== undefined && totalAmount < target.min_per_day * 0.99
      const aboveMax = target.max_per_day !== undefined && totalAmount > target.max_per_day * 1.01
      status = belowMin ? 'deficient' : aboveMax ? 'excess' : 'ok'

      // coverage_pct: % of the most restrictive bound met
      if (pct_of_min !== undefined) coveragePct[nutrientId] = pct_of_min
      else if (pct_of_max !== undefined) coveragePct[nutrientId] = pct_of_max
      else coveragePct[nutrientId] = totalAmount > 0 ? 100 : 0
    }

    if (totalAmount > 0 || target) {
      nutrientResults.push({
        nutrient_id: nutrientId,
        amount_per_day: Math.round(totalAmount * 100000) / 100000,
        unit: unitDef?.unit_canonical ?? 'g',
        pct_of_min,
        pct_of_max,
        status,
      })
    }
  }

  // Ca:Zn molar ratio (post-solve soft warning)
  const caMg = nutrientResults.find(r => r.nutrient_id === 'calcium')?.amount_per_day ?? 0
  const znMg = nutrientResults.find(r => r.nutrient_id === 'zinc')?.amount_per_day   ?? 0
  if (znMg > 0) {
    const ratio = (caMg / CA_MOLAR) / (znMg / ZN_MOLAR)
    if (ratio > CA_ZN_MOLAR_LIMIT) {
      warnings.push(
        `Ca:Zn razão molar = ${ratio.toFixed(0)}:1 (limite clínico: ${CA_ZN_MOLAR_LIMIT}:1). ` +
        `Risco de inibição da absorção de Zinco por competição DMT1. Revisar inclusão de carbonato de cálcio.`
      )
    }
  }

  // Iodine ceiling (rule_4: max 0.5mg/1000kcal)
  const iodineMg = nutrientResults.find(r => r.nutrient_id === 'iodine')?.amount_per_day ?? 0
  if (totalKcal > 0 && iodineMg / (totalKcal / 1000) > 0.5) {
    warnings.push(
      `Iodo excede 0.5mg/1000kcal (atual: ${(iodineMg / (totalKcal / 1000)).toFixed(2)}mg/1000kcal). ` +
      `Risco de Efeito Wolff-Chaikoff (hipotireoidismo). Reduzir kelp.`
    )
  }

  if (!feasible) {
    warnings.push(
      'Solver retornou infeasible. Possíveis causas: restrições nutricionais conflitantes, ' +
      'poucos ingredientes selecionados, ou limites de inclusão muito restritivos.'
    )
  }

  if (der && der > 0 && feasible) {
    const lo = der * 0.97
    const hi = der * 1.03
    if (totalKcal < lo || totalKcal > hi) {
      warnings.push(
        `total_kcal_per_day=${totalKcal.toFixed(1)} fora da faixa DER ±3% ` +
        `[${lo.toFixed(1)}, ${hi.toFixed(1)}] (der=${der}).`
      )
    }
  }

  // Slack usage warnings (v6.7)
  if (feasible) {
    const slTU = Number(result['sl_total_under'] ?? 0)
    const slTO = Number(result['sl_total_over'] ?? 0)
    if (slTU > 1) warnings.push(
      `Total de gramas: slack de ${Math.round(slTU)}g usado — ingredientes fornecem ${totalGrams.toFixed(1)}g de ${minTotal}g mínimos.`
    )
    if (slTO > 1) warnings.push(
      `Total de gramas: slack de ${Math.round(slTO)}g usado para conter excesso — ingredientes fornecem ${totalGrams.toFixed(1)}g de ${maxTotal}g máximos.`
    )
    const slKU = Number(result['sl_der_under'] ?? 0)
    const slKO = Number(result['sl_der_over'] ?? 0)
    if (slKU > 0.5) warnings.push(
      `DER: slack de ${Math.round(slKU)} kcal usado — ingredientes fornecem ${totalKcal.toFixed(1)} kcal de ${der}.`
    )
    if (slKO > 0.5) warnings.push(
      `DER: slack de ${Math.round(slKO)} kcal usado para conter excesso calórico.`
    )
    if (ed) {
      const slEMin = Number(result['sl_ed_min'] ?? 0)
      const slEMax = Number(result['sl_ed_max'] ?? 0)
      if (slEMin > 0.01) warnings.push(
        `Densidade energética (${(totalKcal / totalGrams).toFixed(2)} kcal/g) abaixo do mínimo (${ed.min} kcal/g).`
      )
      if (slEMax > 0.01) warnings.push(
        `Densidade energética acima do máximo (${ed.max} kcal/g).`
      )
    }
    const slCapMin = Number(result['sl_cap_min'] ?? 0)
    const slCapMax = Number(result['sl_cap_max'] ?? 0)
    if (slCapMin > 0.001) warnings.push(`Razão Ca:P abaixo do mínimo.`)
    if (slCapMax > 0.001) warnings.push(`Razão Ca:P acima do máximo.`)
  }

  const totalCost = feasible
    ? Object.entries(gramsMap).reduce((sum, [id, g]) => {
        const ing = ingredients.find(i => i.id === id)
        if (!ing) return sum
        const pricePerG = ing.price_per_kg ? ing.price_per_kg.value / 1000 : 0.025
        return sum + g * pricePerG
      }, 0)
    : 0

  const formulation: Formulation = {
    id: `form_${Date.now()}`,
    dog_profile_id: dogProfileId,
    stage_id: resolvedTargets.stage_id,
    created_at: new Date().toISOString(),
    total_grams_per_day: Math.round(totalGrams * 10) / 10,
    total_kcal_per_day:  Math.round(totalKcal  * 10) / 10,
    energy_density_kcal_per_g: totalGrams > 0
      ? Math.round((totalKcal / totalGrams) * 100) / 100
      : 0,
    allocations,
    nutrient_results: nutrientResults,
    solver_status: solverStatus,
    solver_message: feasible
      ? undefined
      : 'O solver não encontrou solução viável com as restrições fornecidas. ' +
        'Tente selecionar mais ingredientes ou ajustar os limites de inclusão.',
    reconciliation_warnings: warnings,
    coverage_excluded_nutrients: coverageExcluded,
    coverage_pct: Object.keys(coveragePct).length > 0 ? coveragePct : undefined,
    achieved: Object.keys(achieved).length > 0 ? achieved : undefined,
    total_cost: Math.round(totalCost * 100) / 100,
    mode,
    suggested_ingredients: suggestedIngredients.length > 0 ? suggestedIngredients : undefined,
  }

  return { formulation }
}

export function wrapOptimizeResult(formulation: Formulation): OptimizeResult {
  if (formulation.solver_status === 'optimal') {
    return {
      success: true,
      formulation,
      achieved: formulation.achieved ?? {},
      coverage_pct: formulation.coverage_pct ?? {},
      total_cost: formulation.total_cost ?? 0,
    }
  }
  const errorType: Extract<OptimizeResult, { success: false }>['error_type'] =
    formulation.solver_status === 'error' ? 'SOLVER_ERROR' : 'INFEASIBLE'
  return {
    success: false,
    error_type: errorType,
    message: formulation.solver_message ?? 'Solver did not find a feasible solution.',
    details: null,
  }
}
