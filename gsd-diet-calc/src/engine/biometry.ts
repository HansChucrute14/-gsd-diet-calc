/**
 * biometry.ts
 * RER / DER calculations and life-stage multipliers.
 *
 * RER (kcal/day) = 70 × BW(kg)^0.75  (Kleiber formula, NRC 2006)
 * DER (kcal/day) = RER × multiplier
 */

import type { DogProfile, BiometryResult } from '../types'

// ── DER multipliers ──────────────────────────────────────────────────────────
// Source: NRC 2006 / FEDIAF 2024 — Table of energy requirements

interface MultiplierTable {
  // [activity_level][reproductive_status]
  [activityLevel: string]: {
    [reproductiveStatus: string]: number
  }
}

const ADULT_MULTIPLIERS: MultiplierTable = {
  sedentary: { intact: 1.4, neutered: 1.2, pregnant: 1.4, lactating: 1.4 },
  low:       { intact: 1.6, neutered: 1.4, pregnant: 1.6, lactating: 1.6 },
  moderate:  { intact: 1.8, neutered: 1.6, pregnant: 1.8, lactating: 1.8 },
  active:    { intact: 2.0, neutered: 1.8, pregnant: 2.0, lactating: 2.0 },
  working:   { intact: 2.5, neutered: 2.2, pregnant: 2.5, lactating: 2.5 },
  performance: { intact: 3.0, neutered: 2.8, pregnant: 3.0, lactating: 3.0 },
}

// Lactation multiplier scales with litter size — default is 3.0 (peak lactation)
// Gestation: 1.25× at week 1-5, 1.5× at week 6-9 — use 1.5 (conservative)
const LIFE_STAGE_OVERRIDES: Record<string, number> = {
  gestation: 1.5,
  lactation: 3.0,   // peak — tutor must adjust for litter size
}

// Puppy multipliers by age (months)
function puppyMultiplier(ageMonths: number): number {
  if (ageMonths < 4)  return 3.0   // 0–4 months: rapid growth
  if (ageMonths < 6)  return 2.5   // 4–6 months
  if (ageMonths < 12) return 2.0   // 6–12 months
  return 1.8                        // 12–18 months (late growth)
}

// BCS correction factor — adjust target weight for BCS
// BCS 5 = ideal. Each BCS unit ≈ 10% over/under ideal weight
function bcsTargetWeightKg(weightKg: number, bcs: number): number {
  const delta = (bcs - 5) * 0.1  // +10% per BCS above 5
  return weightKg / (1 + delta)
}

// ── Main biometry function ───────────────────────────────────────────────────

export function computeBiometry(profile: DogProfile): BiometryResult {
  const targetWeight = bcsTargetWeightKg(profile.weight_kg, profile.body_condition_score)
  const rer = 70 * Math.pow(targetWeight, 0.75)

  let multiplier: number
  let stage_id: string

  const { life_stage, activity_level, reproductive_status, age_months } = profile

  if (life_stage === 'gestation') {
    multiplier = LIFE_STAGE_OVERRIDES.gestation
    stage_id = 'gestation'
  } else if (life_stage === 'lactation') {
    multiplier = LIFE_STAGE_OVERRIDES.lactation
    stage_id = 'lactation'
  } else if (life_stage === 'puppy_early' || life_stage === 'puppy_late') {
    multiplier = puppyMultiplier(age_months)
    stage_id = age_months < 3.5 ? 'large_breed_puppy_early_growth' : 'large_breed_puppy_late_growth'
  } else if (life_stage === 'senior') {
    const base = ADULT_MULTIPLIERS[activity_level]?.[reproductive_status] ?? 1.6
    multiplier = base * 0.85  // seniors need ~15% fewer calories (sarcopenia adjustment)
    stage_id = 'senior_geriatric'
  } else {
    // adult
    const isWorking = activity_level === 'working' || activity_level === 'performance'
    multiplier = ADULT_MULTIPLIERS[activity_level]?.[reproductive_status] ?? 1.8
    stage_id = isWorking ? 'working_adult' : 'adult_maintenance'
  }

  const der_kcal = rer * multiplier

  return {
    rer_kcal: Math.round(rer * 10) / 10,
    der_kcal: Math.round(der_kcal * 10) / 10,
    target_weight_kg: Math.round(targetWeight * 100) / 100,
    multiplier_used: multiplier,
    stage_id,
  }
}

// ── Helpers for UI display ───────────────────────────────────────────────────

export function bcsLabel(bcs: number): string {
  const labels: Record<number, string> = {
    1: 'Emaciado', 2: 'Muito magro', 3: 'Magro', 4: 'Abaixo do ideal',
    5: 'Ideal', 6: 'Acima do ideal', 7: 'Sobrepeso', 8: 'Obeso', 9: 'Morbidamente obeso',
  }
  return labels[bcs] ?? 'Desconhecido'
}

export function lifeStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    puppy_early: 'Filhote (0–4 meses)',
    puppy_late:  'Filhote em crescimento (4–18 meses)',
    adult:       'Adulto',
    senior:      'Sênior (> 7 anos)',
    gestation:   'Gestação',
    lactation:   'Lactação',
  }
  return labels[stage] ?? stage
}
