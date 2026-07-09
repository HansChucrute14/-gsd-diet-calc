/**
 * targets.ts — v6
 *
 * Converts nutrient density targets (per 1000 kcal) → absolute daily amounts.
 * getNutrientPerGram is the single source of truth for field lookup.
 *
 * KEY CHANGES vs v4/v5:
 *  - Uses raw_field_key from NUTRIENT_REGISTRY (never assumes nutrient_id === field key)
 *  - EPA+DHA: tries omega_3_epa_dha_g first, then sums omega_3_epa_g + omega_3_dha_g
 *  - No FIELD_UNIT_SCALE magic — unit conversion derived from unit_canonical in registry
 *  - der_kcal now passed into ResolvedStageTargets so solver can anchor calorie constraint
 */

import type { RequirementStage, AbsoluteDailyTarget } from '../types'
import { NUTRIENT_REGISTRY } from '../data/nutrientRegistry'

// ── Minimal RawStage type (mirrors parseMdBlocks output) ─────────────────────
// Kept local to avoid src importing from scripts/
export interface RawStage {
  stage_id: string
  applicable_to?: string
  age_months_min?: number
  age_months_max?: number
  targets: Array<{
    nutrient_id: string
    value_min?: number
    value_max?: number
    unit: string
    source?: Array<{ citation: string; evidence_tier: string }>
  }>
  energy_density_constraint?: { value_min: number; value_max: number; source?: unknown }
  ratio_constraints?: Array<{
    nutrient_id: string
    value_min?: number
    value_max?: number
    unit: string
    source?: unknown
  }>
  _source_file?: string
}

// ── Density unit → scale factor (converts per_1000kcal value × DER/1000 → absolute/day) ─
// All "per 1000 kcal" units share the same scale: value × (DER / 1000)
// The unit suffix (g, mg, ug, IU) tells us what the absolute unit is.
const UNIT_MAP: Record<string, string> = {
  'g_per_1000kcal':   'g',
  'mg_per_1000kcal':  'mg',
  'IU_per_1000kcal':  'IU',
  'ug_per_1000kcal':  'ug',
  'g_per_day':        'g',
  'mg_per_day':       'mg',
  'IU_per_day':       'IU',
  'ug_per_day':       'ug',
}

// For _per_day units, no DER scaling needed
const PER_DAY_UNITS = new Set(['g_per_day', 'mg_per_day', 'IU_per_day', 'ug_per_day'])

function convertTarget(value: number | undefined, unit: string, derKcal: number): number | undefined {
  if (value === undefined) return undefined
  if (PER_DAY_UNITS.has(unit)) return value
  // All _per_1000kcal units: multiply by DER/1000
  return value * derKcal / 1000
}

// ── Resolved stage targets ────────────────────────────────────────────────────

export interface AbsoluteDailyTargetResolved {
  nutrient_id: string
  min_per_day?: number
  max_per_day?: number
  unit_absolute: string
  density_unit: string
}

export interface ResolvedStageTargets {
  stage_id: string
  der_kcal: number                   // v6: carried through so solver can anchor DER constraint
  targets: AbsoluteDailyTargetResolved[]
  energy_density_constraint?: { min: number; max: number }
  ratio_constraints?: Array<{
    nutrient_id: string
    min_ratio?: number
    max_ratio?: number
  }>
}

export function resolveTargets(rawStage: RawStage, derKcal: number): ResolvedStageTargets {
  const targets: AbsoluteDailyTargetResolved[] = []

  for (const t of rawStage.targets) {
    const unit = t.unit ?? ''
    if (unit === 'ratio' || unit === 'kcal_per_gram') continue

    const unit_absolute = UNIT_MAP[unit]
    if (!unit_absolute) continue   // unknown unit — skip safely

    const min_per_day = convertTarget(t.value_min, unit, derKcal)
    const max_per_day = convertTarget(t.value_max, unit, derKcal)
    if (min_per_day === undefined && max_per_day === undefined) continue

    targets.push({ nutrient_id: t.nutrient_id, min_per_day, max_per_day, unit_absolute, density_unit: unit })
  }

  let energy_density_constraint: ResolvedStageTargets['energy_density_constraint'] | undefined
  if (rawStage.energy_density_constraint) {
    energy_density_constraint = {
      min: rawStage.energy_density_constraint.value_min,
      max: rawStage.energy_density_constraint.value_max,
    }
  }

  const ratio_constraints = rawStage.ratio_constraints?.map(r => ({
    nutrient_id: r.nutrient_id,
    min_ratio: r.value_min,
    max_ratio: r.value_max,
  }))

  return { stage_id: rawStage.stage_id, der_kcal: derKcal, targets, energy_density_constraint, ratio_constraints }
}

// ── Core nutrient lookup — THE single source of truth ────────────────────────
//
// v6 RULE: always use raw_field_key from NUTRIENT_REGISTRY.
// Never assume per_100g_as_fed[nutrient_id] — the keys are different strings.
//
// Unit handling:
//   The database stores values in the unit implied by the field suffix:
//     _g   → grams     (unit_canonical 'g')
//     _mg  → mg        (unit_canonical 'mg')
//     _ug  → micrograms(unit_canonical 'ug')
//     _iu  → IU        (unit_canonical 'IU')
//
//   The target unit (from stages) uses the same unit_canonical.
//   So: (raw_value_per_100g / 100) already gives per-gram in the canonical unit.
//   NO further unit conversion needed — as long as raw_field_key and unit_canonical match.
//
// EPA+DHA special case (v6 Seção 3.4.1):
//   1. Try combined field omega_3_epa_dha_g first
//   2. Fall back to omega_3_epa_g + omega_3_dha_g
//   Both are in grams; unit_canonical is 'g'. No conversion needed.

/** Alias keys seen in Banco Beta v0.3 that are not the canonical raw_field_key. */
const FIELD_ALIASES: Record<string, string[]> = {
  pyridoxine: ['vitamin_b6_mg'],
}

export type BioavailabilityFactorsInput = {
  zinc_absorption?: number
  calcium_absorption?: number
  iron_absorption?: number
  ala_to_epa_dha_conversion?: number
}

const BIOAVAIL_FACTOR_BY_NUTRIENT: Record<string, keyof BioavailabilityFactorsInput> = {
  zinc: 'zinc_absorption',
  calcium: 'calcium_absorption',
  iron: 'iron_absorption',
  // ALA→EPA/DHA conversion is not applied to epa_dha here; epa_dha is preformed marine only
}

/**
 * Lookup nutrient amount per gram of as-fed ingredient.
 * @param bioavailabilityFactors optional — when present, multiplies the raw coefficient (v6 §3.4.1)
 */
export function getNutrientPerGram(
  per100g: Record<string, number | null | undefined>,
  nutrientId: string,
  bioavailabilityFactors?: BioavailabilityFactorsInput | null,
): number {
  // EPA+DHA: special sum logic
  let perGram = 0
  if (nutrientId === 'epa_dha') {
    const combined = per100g['omega_3_epa_dha_g']
    if (combined !== null && combined !== undefined) {
      perGram = combined / 100
    } else {
      const epa = per100g['omega_3_epa_g'] ?? 0
      const dha = per100g['omega_3_dha_g'] ?? 0
      perGram = ((epa as number) + (dha as number)) / 100
    }
  } else {
    const def = NUTRIENT_REGISTRY[nutrientId]
    if (!def) return 0

    let rawValue = per100g[def.raw_field_key]
    if (rawValue === null || rawValue === undefined) {
      for (const alias of FIELD_ALIASES[nutrientId] ?? []) {
        const alt = per100g[alias]
        if (alt !== null && alt !== undefined) {
          rawValue = alt
          break
        }
      }
    }
    if (rawValue === null || rawValue === undefined) return 0 // null = unknown → 0 for LP coeff only
    perGram = (rawValue as number) / 100
  }

  if (bioavailabilityFactors) {
    const key = BIOAVAIL_FACTOR_BY_NUTRIENT[nutrientId]
    if (key) {
      const factor = bioavailabilityFactors[key]
      if (typeof factor === 'number' && factor >= 0 && factor <= 1) {
        perGram = perGram * factor
      }
    }
  }

  return perGram
}

// ── Stage label helper ────────────────────────────────────────────────────────

function stageLabel(stageId: string): string {
  const labels: Record<string, string> = {
    large_breed_puppy_early_growth: 'Filhote raça grande — crescimento inicial (0–3.5 meses)',
    large_breed_puppy_late_growth:  'Filhote raça grande — crescimento tardio (3.5–18 meses)',
    adult_maintenance:              'Adulto — manutenção',
    senior_geriatric:               'Sênior / Geriátrico (> 7 anos)',
    working_adult:                  'Adulto — trabalho/performance',
  }
  return labels[stageId] ?? stageId
}

// ── Zod-compatible conversion for UI display ─────────────────────────────────

export function rawStageToRequirementStage(raw: RawStage): RequirementStage {
  return {
    stage_id: raw.stage_id,
    label_pt: stageLabel(raw.stage_id),
    targets: raw.targets.map(t => ({
      nutrient_id: t.nutrient_id,
      min: t.value_min,
      max: t.value_max,
      unit: t.unit,
      source: t.source as AbsoluteDailyTarget['source'],
    })),
    global_constraints: raw.energy_density_constraint
      ? [{
        constraint_id: 'energy_density' as const,
        value_min_kcal_per_gram: raw.energy_density_constraint.value_min,
        value_max_kcal_per_gram: raw.energy_density_constraint.value_max,
      }]
      : undefined,
    ratio_constraints: raw.ratio_constraints?.map(r => ({
      constraint_id: r.nutrient_id,
      numerator_nutrient_id:   r.nutrient_id === 'calcium_phosphorus_ratio' ? 'calcium'    : r.nutrient_id,
      denominator_nutrient_id: r.nutrient_id === 'calcium_phosphorus_ratio' ? 'phosphorus' : r.nutrient_id,
      min_ratio: r.value_min,
      max_ratio: r.value_max,
    })),
  }
}

// ── Coverage check (used by CoverageGate in solver) ──────────────────────────
// Returns true if at least one ingredient in the catalog has a non-null, non-zero value
// for this nutrient.

export function nutrientHasCoverage(
  nutrientId: string,
  catalog: Array<{ per_100g_as_fed: Record<string, number | null | undefined> }>,
): boolean {
  for (const ing of catalog) {
    if (getNutrientPerGram(ing.per_100g_as_fed, nutrientId) > 0) return true
  }
  return false
}
