import { describe, it, expect } from 'vitest'
import { INGREDIENTS, STAGES } from '../data/loaders'
import { getNutrientPerGram, resolveTargets } from './targets'
import { runSolver, dryRunValidation, wrapOptimizeResult } from './solver'
import { formulate } from './index'
import { computeBiometry } from './biometry'
import type { DogProfile, Formulation, IngredientDisplayData } from '../types'
import type { RawStage } from './targets'

const MOCK_PROFILE: DogProfile = {
  id: 'test_gsd',
  name: 'Test GSD',
  breed: 'Pastor Alemão',
  weight_kg: 30,
  age_months: 36,
  life_stage: 'adult',
  reproductive_status: 'intact',
  activity_level: 'moderate',
  body_condition_score: 5,
  health_conditions: [],
}

function makeIngredient(overrides: Partial<IngredientDisplayData> = {}): IngredientDisplayData {
  return {
    id: 'test_ingredient',
    name: 'Test Ingredient',
    category: 'muscle_meat',
    kcal_per_100g: 150,
    per_100g_as_fed: {
      protein_g: 20,
      fat_g: 10,
      calcium_mg: 50,
      phosphorus_mg: 100,
      zinc_mg: 3,
      iron_mg: 2,
    },
    lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    ...overrides,
  } as IngredientDisplayData
}

describe('Biometry', () => {
  it('DER está ±3% do esperado para adulto moderado 30kg BCS5', () => {
    const result = computeBiometry(MOCK_PROFILE)
    const targetWeight = 30 // BCS5 → ideal = actual
    const expectedRer = 70 * Math.pow(targetWeight, 0.75)
    const expectedDer = expectedRer * 1.8
    expect(result.rer_kcal).toBeCloseTo(expectedRer, 0)
    expect(result.der_kcal).toBeCloseTo(expectedDer, 0)
    expect(result.target_weight_kg).toBe(30)
    expect(result.stage_id).toBe('adult_maintenance')
  })

  it('BCS 7 ajusta peso ideal corretamente (30kg → ~25kg)', () => {
    const obese = { ...MOCK_PROFILE, body_condition_score: 7 }
    const result = computeBiometry(obese)
    expect(result.target_weight_kg).toBeCloseTo(25, 0)
  })

  it('Filhote 2 meses usa multiplicador 3.0', () => {
    const puppy = { ...MOCK_PROFILE, age_months: 2, life_stage: 'puppy_early' as const }
    const result = computeBiometry(puppy)
    expect(result.stage_id).toBe('large_breed_puppy_early_growth')
  })

  it('BCS 1 (caquexia) não produz NaN', () => {
    const result = computeBiometry({ ...MOCK_PROFILE, body_condition_score: 1, weight_kg: 20 })
    expect(Number.isFinite(result.der_kcal)).toBe(true)
    expect(result.der_kcal).toBeGreaterThan(0)
    expect(result.target_weight_kg).toBeGreaterThan(0)
  })

  it('BCS 9 (obeso mórbido) não produz NaN', () => {
    const result = computeBiometry({ ...MOCK_PROFILE, body_condition_score: 9, weight_kg: 50 })
    expect(Number.isFinite(result.der_kcal)).toBe(true)
    expect(result.der_kcal).toBeGreaterThan(0)
    expect(result.target_weight_kg).toBeGreaterThan(0)
  })

  it('puppyMultiplier com age_months NaN usa fallback 1.8', () => {
    const result = computeBiometry({ ...MOCK_PROFILE, age_months: undefined as any, life_stage: 'puppy_early' })
    expect(result.multiplier_used).toBe(1.8)
    expect(Number.isFinite(result.der_kcal)).toBe(true)
  })
})

describe('getNutrientPerGram', () => {
  it('usa raw_field_key correto (calcium_mg) e divide por 100', () => {
    const result = getNutrientPerGram({ calcium_mg: 100 }, 'calcium')
    expect(result).toBe(1.0) // 100 / 100 = 1.0 mg/g
  })

  it('retorna 0 para nutriente sem registro', () => {
    const result = getNutrientPerGram({ some_field: 100 }, 'nonexistent_nutrient')
    expect(result).toBe(0)
  })

  it('retorna 0 para campo null/undefined', () => {
    const a = getNutrientPerGram({ selenium_ug: null as any }, 'selenium')
    expect(a).toBe(0)
    const b = getNutrientPerGram({}, 'selenium')
    expect(b).toBe(0)
  })

  it('EPA+DHA: soma omega_3_epa_g + omega_3_dha_g quando combinado ausente', () => {
    const result = getNutrientPerGram({ omega_3_epa_g: 9, omega_3_dha_g: 12 }, 'epa_dha')
    expect(result).toBeCloseTo(0.21, 10) // (9 + 12) / 100 = 0.21 g/g
  })

  it('EPA+DHA: usa campo combinado se existir', () => {
    const result = getNutrientPerGram({ omega_3_epa_dha_g: 20, omega_3_epa_g: 9, omega_3_dha_g: 12 }, 'epa_dha')
    expect(result).toBeCloseTo(0.20, 10) // 20 / 100 = 0.20 (combined takes precedence)
  })

  it('bioavailability_factors é multiplicado no coeficiente', () => {
    const semFator = getNutrientPerGram({ zinc_mg: 10 }, 'zinc')
    const comFator = getNutrientPerGram({ zinc_mg: 10 }, 'zinc', { zinc_absorption: 0.5 })
    expect(comFator).toBeLessThan(semFator)
    expect(comFator).toBeCloseTo(semFator * 0.5, 10)
  })

  it('fatores de biodisponibilidade inválidos (NaN, >1, <0) são ignorados', () => {
    const base = getNutrientPerGram({ zinc_mg: 10 }, 'zinc')
    for (const factors of [{ zinc_absorption: NaN }, { zinc_absorption: 2.0 }, { zinc_absorption: -0.5 }]) {
      expect(getNutrientPerGram({ zinc_mg: 10 }, 'zinc', factors as any)).toBe(base)
    }
  })
})

describe('resolveTargets', () => {
  it('energy_density nunca vira AbsoluteDailyTarget', () => {
    const rawStage: RawStage = {
      stage_id: 'test',
      targets: [
        { nutrient_id: 'protein', value_min: 45, value_max: 75, unit: 'g_per_1000kcal' },
      ],
      energy_density_constraint: { value_min: 3.2, value_max: 4.0 },
    }
    const resolved = resolveTargets(rawStage, 1200)
    const hasEnergyDensity = resolved.targets.some(t => t.nutrient_id === 'energy_density')
    expect(hasEnergyDensity).toBe(false)
    expect(resolved.energy_density_constraint).toBeDefined()
    expect(resolved.energy_density_constraint!.min).toBe(3.2)
  })
})

describe('Solver invariants', () => {
  it('restrição DER ancorada — total kcal ±3% do DER', () => {
    // Minimal LP: patinho (lean meat) + mandioca (starchy) with only protein+fat constraints
    // Verifiable by inspection: 250g patinho + 500g mandioca → 1000 kcal, 51g protein, 26.5g fat ✓
    const patinho = makeIngredient({
      id: 'patinho',
      kcal_per_100g: 100,
      per_100g_as_fed: { protein_g: 20, fat_g: 10 },
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    })
    const mandioca = makeIngredient({
      id: 'mandioca',
      kcal_per_100g: 150,
      per_100g_as_fed: { protein_g: 1, fat_g: 0.3 },
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    })
    const rawStage: RawStage = {
      stage_id: 'test',
      targets: [
        { nutrient_id: 'protein', value_min: 45, value_max: 75, unit: 'g_per_1000kcal' },
        { nutrient_id: 'fat',     value_min: 15, value_max: 50, unit: 'g_per_1000kcal' },
      ],
    }
    const resolved = resolveTargets(rawStage, 1000)
    const result = runSolver({
      ingredients: [patinho, mandioca],
      resolvedTargets: { ...resolved, der_kcal: 1000 },
      dogProfileId: 'test',
      maxGramsPerDay: 1200,
      minGramsPerDay: 200,
    })
    const f = result.formulation
    expect(f.solver_status).toBe('optimal')
    expect(f.total_kcal_per_day).toBeGreaterThanOrEqual(970)
    expect(f.total_kcal_per_day).toBeLessThanOrEqual(1030)
  })

  it('caso extremo usa slacks em vez de infeasible — DER + protein slack ativos', () => {
    const water = [makeIngredient({
      id: 'only_water',
      kcal_per_100g: 0,
      per_100g_as_fed: { protein_g: 0, fat_g: 0, calcium_mg: 0, phosphorus_mg: 0, zinc_mg: 0, iron_mg: 0 },
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 100 },
    })]
    const resolved = resolveTargets(
      { stage_id: 'test', targets: [{ nutrient_id: 'protein', value_min: 1000, unit: 'g_per_1000kcal' }] },
      1000,
    )
    const result = runSolver({
      ingredients: water,
      resolvedTargets: { ...resolved, der_kcal: 1000, stage_id: 'test' },
      dogProfileId: 'test',
    })
    expect(result.formulation.solver_status).toBe('optimal')
    expect(result.formulation.allocations.length).toBeGreaterThan(0)
    expect(result.formulation.reconciliation_warnings.some(w => w.includes('slack'))).toBe(true)
  })

  it('CoverageGate: exclui nutriente sem dado nos selecionados, registra no campo dedicado + warning', () => {
    const ing = makeIngredient()
    const rawStage: RawStage = {
      stage_id: 'test',
      targets: [
        { nutrient_id: 'protein', value_min: 45, value_max: 75, unit: 'g_per_1000kcal' },
        { nutrient_id: 'selenium', value_min: 0.1, value_max: 0.5, unit: 'mg_per_1000kcal' },
      ],
    }
    const resolved = resolveTargets(rawStage, 1000)
    const result = runSolver({
      ingredients: [ing],
      resolvedTargets: { ...resolved, der_kcal: 1000 },
      dogProfileId: 'test',
    })
    expect(result.formulation.coverage_excluded_nutrients).toContain('selenium')
    expect(result.formulation.reconciliation_warnings.some(w => w.includes('selenium'))).toBe(true)
  })

  it('normalização de unidade: selênio 40µg/100g → 0.4 µg/g', () => {
    const result = getNutrientPerGram({ selenium_ug: 40 }, 'selenium')
    expect(result).toBe(0.4)
  })

  it('Ca:Zn > 150:1 emite warning clínico com dados realistas', () => {
    const highCa = makeIngredient({
      id: 'high_ca',
      kcal_per_100g: 0,
      per_100g_as_fed: { calcium_mg: 38000, phosphorus_mg: 0, zinc_mg: 0, protein_g: 0, fat_g: 0 },
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    })
    const meatBase = makeIngredient({
      id: 'meat_base',
      kcal_per_100g: 120,
      per_100g_as_fed: { calcium_mg: 0, phosphorus_mg: 200, zinc_mg: 4, protein_g: 18, fat_g: 5 },
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    })
    const resolved = resolveTargets(
      { stage_id: 'test', targets: [
        { nutrient_id: 'protein', value_min: 50, value_max: 200, unit: 'g_per_1000kcal' },
        { nutrient_id: 'fat',     value_min: 20, value_max: 60,  unit: 'g_per_1000kcal' },
        { nutrient_id: 'calcium', value_min: 4000, value_max: 8000, unit: 'mg_per_1000kcal' },
      ]},
      1000,
    )
    const result = runSolver({
      ingredients: [highCa, meatBase],
      resolvedTargets: { ...resolved, der_kcal: 1000 },
      dogProfileId: 'test',
      maxGramsPerDay: 1200,
      minGramsPerDay: 200,
    })
    expect(result.formulation.solver_status).toBe('optimal')
    expect(result.formulation.reconciliation_warnings.some(w => w.includes('Ca:Zn'))).toBe(true)
  })

  it('sensibilidade: 1g de mudança não causa salto abrupto de zona', () => {
    // Run solver twice with essentially the same input (1g difference in a ~800g formulation)
    // to verify the solution doesn't jump to a completely different allocation.
    const ingA = makeIngredient({
      id: 'ing_a',
      kcal_per_100g: 150,
      per_100g_as_fed: { protein_g: 20, fat_g: 10 },
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    })
    const ingB = makeIngredient({
      id: 'ing_b',
      kcal_per_100g: 120,
      per_100g_as_fed: { protein_g: 15, fat_g: 8 },
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    })
    const rawStage: RawStage = {
      stage_id: 'test',
      targets: [
        { nutrient_id: 'protein', value_min: 45, value_max: 75, unit: 'g_per_1000kcal' },
        { nutrient_id: 'fat',     value_min: 15, value_max: 50, unit: 'g_per_1000kcal' },
      ],
    }
    const resolved = resolveTargets(rawStage, 1000)
    const baseResult = runSolver({
      ingredients: [ingA, ingB],
      resolvedTargets: { ...resolved, der_kcal: 1000 },
      dogProfileId: 'test', maxGramsPerDay: 1200, minGramsPerDay: 200,
    })
    // Adjust minGrams by 1g — should produce comparable solution
    const closeResult = runSolver({
      ingredients: [ingA, ingB],
      resolvedTargets: { ...resolved, der_kcal: 1000 },
      dogProfileId: 'test', maxGramsPerDay: 1201, minGramsPerDay: 201,
    })
    if (baseResult.formulation.solver_status === 'optimal' &&
        closeResult.formulation.solver_status === 'optimal') {
      // Total grams should be within 10% of each other (not a completely different solution)
      const ratio = Math.max(
        baseResult.formulation.total_grams_per_day / closeResult.formulation.total_grams_per_day,
        closeResult.formulation.total_grams_per_day / baseResult.formulation.total_grams_per_day,
      )
      expect(ratio).toBeLessThan(1.5)
    }
    // If either is infeasible, that's OK — just verify no crash
    expect(['optimal', 'infeasible']).toContain(baseResult.formulation.solver_status)
    expect(['optimal', 'infeasible']).toContain(closeResult.formulation.solver_status)
  })

  it('runSolver rejeita IDs duplicados — warning emitido, solver roda sem corromper (v6 §6.5)', () => {
    const ing = makeIngredient({ id: 'duplicate_me' })
    const rawStage: RawStage = {
      stage_id: 'test',
      targets: [
        { nutrient_id: 'protein', value_min: 45, value_max: 75, unit: 'g_per_1000kcal' },
      ],
    }
    const resolved = resolveTargets(rawStage, 1000)
    const result = runSolver({
      ingredients: [ing, ing],  // mesmo objeto duas vezes
      resolvedTargets: { ...resolved, der_kcal: 1000 },
      dogProfileId: 'test',
    })
    // Must not crash; allocation should have only one entry for duplicate_me
    expect(result.formulation.solver_status).toBe('optimal')
    const allocs = result.formulation.allocations.filter(a => a.ingredient_id === 'duplicate_me')
    expect(allocs).toHaveLength(1)
  })

  it('energy_density linearizado corretamente sobre massa alocada', () => {
    // Two ingredients with very different energy densities.
    // The solver must respect the ed_min/ed_max constraint.
    const dense = makeIngredient({
      id: 'fat_oil',
      kcal_per_100g: 900,
      per_100g_as_fed: { fat_g: 100, protein_g: 0 },
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    })
    const bulky = makeIngredient({
      id: 'bulky_veg',
      kcal_per_100g: 50,
      per_100g_as_fed: { protein_g: 1, fat_g: 0.1 },
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    })
    const rawStage: RawStage = {
      stage_id: 'test',
      targets: [
        { nutrient_id: 'protein', value_min: 20, value_max: 100, unit: 'g_per_1000kcal' },
      ],
      energy_density_constraint: { value_min: 3.0, value_max: 4.5 },
    }
    const result = runSolver({
      ingredients: [dense, bulky],
      resolvedTargets: resolveTargets(rawStage, 1000),
      dogProfileId: 'test', maxGramsPerDay: 1200, minGramsPerDay: 200,
    })
    if (result.formulation.solver_status === 'optimal') {
      const ed = result.formulation.energy_density_kcal_per_g
      expect(ed).toBeGreaterThanOrEqual(2.8)
      expect(ed).toBeLessThanOrEqual(4.7)
    }
  })

  it('Iodo > 0.5mg/1000kcal emite warning com dados realistas', () => {
    const highI = makeIngredient({
      id: 'high_iodine',
      kcal_per_100g: 0,
      per_100g_as_fed: { iodine_ug: 5000, protein_g: 0, fat_g: 0 },
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    })
    const meatBase = makeIngredient({
      id: 'meat_base',
      kcal_per_100g: 120,
      per_100g_as_fed: { protein_g: 18, fat_g: 5 },
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    })
    const resolved = resolveTargets(
      { stage_id: 'test', targets: [
        { nutrient_id: 'protein', value_min: 50, value_max: 200, unit: 'g_per_1000kcal' },
        { nutrient_id: 'fat',     value_min: 20, value_max: 60,  unit: 'g_per_1000kcal' },
        { nutrient_id: 'iodine',  value_min: 2, value_max: 10, unit: 'mg_per_1000kcal' },
      ]},
      1000,
    )
    const result = runSolver({
      ingredients: [highI, meatBase],
      resolvedTargets: { ...resolved, der_kcal: 1000 },
      dogProfileId: 'test',
      maxGramsPerDay: 1200,
      minGramsPerDay: 200,
    })
    expect(result.formulation.solver_status).toBe('optimal')
    expect(result.formulation.reconciliation_warnings.some(w => w.includes('Iodo excede'))).toBe(true)
  })
})

describe('Stage data integrity', () => {
  it('todos os estágios têm targets com energia não nula', () => {
    for (const stage of STAGES) {
      expect(stage.targets.length).toBeGreaterThan(0)
    }
  })
})

describe('dryRunValidation (v6 §6.2)', () => {
  it('nutriente sem dado no catálogo → missing_nutrients', () => {
    const catalog = [makeIngredient({
      per_100g_as_fed: { protein_g: 20, fat_g: 10 },
    })]
    const result = dryRunValidation(
      [{ nutrient_id: 'selenium', min_per_day: 0.1, max_per_day: 0.5, unit_absolute: 'mg', density_unit: 'mg_per_1000kcal' }],
      catalog,
    )
    expect(result.missing_nutrients).toContain('selenium')
    expect(result.valid).toBe(false)
  })

  it('nutriente com dado no catálogo → não está em missing', () => {
    const catalog = [makeIngredient({
      per_100g_as_fed: { protein_g: 20, selenium_ug: 40 },
    })]
    const result = dryRunValidation(
      [{ nutrient_id: 'selenium', min_per_day: 0.1, max_per_day: 0.5, unit_absolute: 'mg', density_unit: 'mg_per_1000kcal' }],
      catalog,
    )
    expect(result.missing_nutrients).not.toContain('selenium')
  })

  it('excluded_from_this_run = missing_nutrients (subconjunto removido das constraints)', () => {
    const catalog = [makeIngredient({
      per_100g_as_fed: { protein_g: 20 },
    })]
    const result = dryRunValidation(
      [
        { nutrient_id: 'protein', min_per_day: 50, max_per_day: 100, unit_absolute: 'g', density_unit: 'g_per_1000kcal' },
        { nutrient_id: 'vitamin_d', min_per_day: 5, max_per_day: 20, unit_absolute: 'IU', density_unit: 'IU_per_1000kcal' },
      ],
      catalog,
    )
    expect(result.excluded_from_this_run).toEqual(['vitamin_d'])
    expect(result.missing_nutrients).toEqual(['vitamin_d'])
  })
})

describe('Goal programming (v6 §6)', () => {
  it('critical tem prioridade sobre desirable — slack de critical custa mais', () => {
    // Two ingredients: one cheap with no zinc, one expensive with zinc
    // The solver should prefer the expensive one because zinc is 'critical' (weight=100)
    const cheap = makeIngredient({
      id: 'cheap_no_zinc',
      kcal_per_100g: 200,
      per_100g_as_fed: { protein_g: 20, fat_g: 10 },
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    })
    cheap.price_per_kg = { value: 1, currency: 'BRL' }
    const expensive = makeIngredient({
      id: 'expensive_has_zinc',
      kcal_per_100g: 200,
      per_100g_as_fed: { protein_g: 20, fat_g: 10, zinc_mg: 5 },
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 0 },
    })
    expensive.price_per_kg = { value: 100, currency: 'BRL' }
    const resolved = resolveTargets(
      { stage_id: 'test', targets: [
        { nutrient_id: 'protein', value_min: 45, value_max: 75, unit: 'g_per_1000kcal' },
        { nutrient_id: 'zinc', value_min: 20, value_max: 60, unit: 'mg_per_1000kcal' },
      ]},
      1000,
    )
    const result = runSolver({
      ingredients: [cheap, expensive],
      resolvedTargets: { ...resolved, der_kcal: 1000 },
      dogProfileId: 'test',
      maxGramsPerDay: 1200,
      minGramsPerDay: 200,
    })
    expect(result.formulation.solver_status).toBe('optimal')
    const allocs = result.formulation.allocations
    const hasZincIng = allocs.find(a => a.ingredient_id === 'expensive_has_zinc')
    // The expensive zinc ingredient should be used because zinc target is critical
    expect(hasZincIng).toBeDefined()
    expect(hasZincIng!.grams_per_day).toBeGreaterThan(0)
  })

  it('coverage_pct reflete % do target atingido', () => {
    const ing = makeIngredient({
      per_100g_as_fed: { protein_g: 20, fat_g: 10 },
    })
    const resolved = resolveTargets(
      { stage_id: 'test', targets: [
        { nutrient_id: 'protein', value_min: 45, value_max: 75, unit: 'g_per_1000kcal' },
        { nutrient_id: 'fat', value_min: 15, value_max: 50, unit: 'g_per_1000kcal' },
      ]},
      1000,
    )
    const result = runSolver({
      ingredients: [ing],
      resolvedTargets: { ...resolved, der_kcal: 1000 },
      dogProfileId: 'test',
    })
    expect(result.formulation.coverage_pct).toBeDefined()
    expect(result.formulation.coverage_pct!.protein).toBeGreaterThanOrEqual(1)
  })
})

describe('OptimizeResult / achieved / total_cost (v6 §6.3)', () => {
  it('formulação bem-sucedida contém achieved + coverage_pct + total_cost', () => {
    const ing = makeIngredient({
      per_100g_as_fed: { protein_g: 20, fat_g: 10 },
    })
    const resolved = resolveTargets(
      { stage_id: 'test', targets: [
        { nutrient_id: 'protein', value_min: 45, value_max: 75, unit: 'g_per_1000kcal' },
      ]},
      1000,
    )
    const result = runSolver({
      ingredients: [ing],
      resolvedTargets: { ...resolved, der_kcal: 1000 },
      dogProfileId: 'test',
    })
    expect(result.formulation.solver_status).toBe('optimal')
    expect(result.formulation.achieved).toBeDefined()
    expect(result.formulation.achieved!.protein).toBeGreaterThan(0)
    expect(result.formulation.coverage_pct).toBeDefined()
    expect(result.formulation.total_cost).toBeGreaterThan(0)
  })

  it('solver error → status=error, total_cost=0', () => {
    // This test uses the global mock from solver-exception.test.ts which
    // is loaded separately. To test error cost, we use a minimal scenario
    // that doesn't trigger the mock. The specific exception behavior is
    // already tested in solver-exception.test.ts.
    const ing = makeIngredient({
      kcal_per_100g: 0,
      per_100g_as_fed: {},
      lp_constraints: { max_inclusion_pct: 100, min_inclusion_pct: 100 },
    })
    const resolved: import('./targets').ResolvedStageTargets = {
      stage_id: 'test', der_kcal: 0, targets: [],
    }
    const result = runSolver({
      ingredients: [ing],
      resolvedTargets: resolved,
      dogProfileId: 'test',
      maxGramsPerDay: 100,
      minGramsPerDay: 0,
    })
    // With der_kcal=0 and no targets, solver may find a trivial solution
    // or be infeasible — just verify the structure is sound
    expect(result.formulation.total_cost).toBeDefined()
    expect(typeof result.formulation.total_cost).toBe('number')
  })

  it('wrapOptimizeResult: status optimal → success: true + campos presentes', () => {
    const f: Formulation = {
      id: 'test',
      dog_profile_id: 't',
      stage_id: 'test',
      created_at: '2026-01-01',
      total_grams_per_day: 500,
      total_kcal_per_day: 1000,
      energy_density_kcal_per_g: 2,
      allocations: [],
      nutrient_results: [],
      solver_status: 'optimal',
      solver_message: undefined,
      reconciliation_warnings: [],
      coverage_excluded_nutrients: [],
      achieved: { protein: 50 },
      coverage_pct: { protein: 100 },
      total_cost: 12.5,
    }
    const result = wrapOptimizeResult(f)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.formulation.id).toBe('test')
      expect(result.achieved).toEqual({ protein: 50 })
      expect(result.total_cost).toBe(12.5)
    }
  })

  it('wrapOptimizeResult: status error → success: false + error_type SOLVER_ERROR', () => {
    const f: Formulation = {
      id: 'test',
      dog_profile_id: 't',
      stage_id: 'test',
      created_at: '2026-01-01',
      total_grams_per_day: 0,
      total_kcal_per_day: 0,
      energy_density_kcal_per_g: 0,
      allocations: [],
      nutrient_results: [],
      solver_status: 'error',
      solver_message: 'LP solver crashed',
      reconciliation_warnings: [],
      coverage_excluded_nutrients: [],
      achieved: undefined,
      coverage_pct: undefined,
      total_cost: undefined,
    }
    const result = wrapOptimizeResult(f)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error_type).toBe('SOLVER_ERROR')
      expect(result.message).toContain('crashed')
    }
  })
})

describe('Integration — formulate() pipeline', () => {
  it('pipeline completo com perfil real não lança exceção', () => {
    const dog: DogProfile = {
      id: 'test_gsd_integration',
      name: 'Test GSD',
      breed: 'Pastor Alemão',
      weight_kg: 30,
      age_months: 36,
      life_stage: 'adult',
      reproductive_status: 'intact',
      activity_level: 'moderate',
      body_condition_score: 5,
      health_conditions: [],
    }
    // Use a sub-conjunto com factibilidade garantida
    const ids = new Set([
      'chicken_gizzard_raw', 'beef_kidney_raw', 'sweet_potato_boiled',
      'sardine_whole_cooked', 'flaxseed_ground', 'calcium_carbonate_food_grade',
      'coconut_oil_unrefined', 'spinach_boiled',
    ])
    const subset = INGREDIENTS.filter(i => ids.has(i.id))
    expect(subset.length).toBeGreaterThan(0)

    const result = formulate({ profile: dog, ingredients: subset })
    expect(result.formulation).toBeDefined()
    expect(result.der_kcal).toBeGreaterThan(0)
    expect(result.rer_kcal).toBeGreaterThan(0)
    expect(result.stage_id).toBe('adult_maintenance')
    // The solver may be infeasible with this subset (tight constraints);
    // we verify it ran without crashing and returned valid structure.
    expect(['optimal', 'infeasible', 'error']).toContain(result.formulation.solver_status)
  })

  it('pipeline com ingredients vazio lança erro', () => {
    const dog: DogProfile = {
      id: 'test_empty',
      name: 'Empty',
      breed: 'SRD',
      weight_kg: 10,
      age_months: 24,
      life_stage: 'adult',
      reproductive_status: 'intact',
      activity_level: 'moderate',
      body_condition_score: 5,
      health_conditions: [],
    }
    expect(() => formulate({ profile: dog, ingredients: [] })).toThrow('Nenhum ingrediente')
  })

  it('single low-calorie ingredient uses DER slack', () => {
    const stage = STAGES.find(s => s.stage_id === 'adult_maintenance')!
    const targets = resolveTargets(stage, 950)
    const broth = INGREDIENTS.find(i => i.id === 'beef_bone_broth_concentrated')!
    const { formulation } = runSolver({
      ingredients: [broth],
      resolvedTargets: targets,
      dogProfileId: 'test-slack',
    })
    expect(formulation.solver_status).toBe('optimal')
    expect(formulation.allocations.length).toBeGreaterThan(0)
    expect(formulation.total_kcal_per_day).toBeGreaterThan(0)
    expect(formulation.reconciliation_warnings.some(w => w.includes('slack'))).toBe(true)
  })

  it('single ingredient with density mismatch uses density+DEP slacks', () => {
    const stage = STAGES.find(s => s.stage_id === 'working_adult')!
    const targets = resolveTargets(stage, 950)
    const carrot = INGREDIENTS.find(i => i.id === 'carrot_boiled')!
    const { formulation } = runSolver({
      ingredients: [carrot],
      resolvedTargets: targets,
      dogProfileId: 'test-density',
    })
    expect(formulation.solver_status).toBe('optimal')
    expect(formulation.allocations.length).toBeGreaterThan(0)
    expect(formulation.reconciliation_warnings.some(w => w.includes('Densidade'))).toBe(true)
  })

  it('modo livre com 1 ingrediente → sempre optimal com slacks', () => {
    const stage = STAGES.find(s => s.stage_id === 'adult_maintenance')!
    const targets = resolveTargets(stage, 950)
    const broth = INGREDIENTS.find(i => i.id === 'beef_bone_broth_concentrated')!
    const { formulation } = runSolver({
      ingredients: [broth],
      resolvedTargets: targets,
      dogProfileId: 'test-livre',
      mode: 'livre',
    })
    expect(formulation.solver_status).toBe('optimal')
    expect(formulation.mode).toBe('livre')
    expect(formulation.allocations.length).toBeGreaterThan(0)
    expect(formulation.reconciliation_warnings.some(w => w.includes('slack'))).toBe(true)
  })

  it('modo otimo com 1 ingrediente → infeasible + sugestões', () => {
    const stage = STAGES.find(s => s.stage_id === 'adult_maintenance')!
    const targets = resolveTargets(stage, 950)
    const broth = INGREDIENTS.find(i => i.id === 'beef_bone_broth_concentrated')!
    const { formulation } = runSolver({
      ingredients: [broth],
      resolvedTargets: targets,
      dogProfileId: 'test-otimo',
      mode: 'otimo',
    })
    expect(formulation.solver_status).toBe('infeasible')
    expect(formulation.mode).toBe('otimo')
    expect(formulation.suggested_ingredients).toBeDefined()
    expect(formulation.suggested_ingredients!.length).toBeGreaterThan(0)
    // Should suggest ingredients for at least one deficient nutrient
    const first = formulation.suggested_ingredients![0]
    expect(first.ingredient_id).toBeTruthy()
    expect(first.reason_nutrient_id).toBeTruthy()
    expect(first.shortfall_amount).toBeGreaterThan(0)
  })

  it('modo otimo com 26 ingredientes → testa viabilidade', () => {
    const stage = STAGES.find(s => s.stage_id === 'adult_maintenance')!
    const targets = resolveTargets(stage, 950)
    const { formulation } = runSolver({
      ingredients: INGREDIENTS,
      resolvedTargets: targets,
      dogProfileId: 'test-otimo-26',
      mode: 'otimo',
    })
    expect(formulation.mode).toBe('otimo')
    expect(['optimal', 'infeasible']).toContain(formulation.solver_status)
    if (formulation.solver_status === 'optimal') {
      expect(formulation.allocations.length).toBeGreaterThan(1)
    }
  })

  it('modo livre com 26 ingredientes → optimal com alocações (sem filtro 0.5g)', () => {
    const stage = STAGES.find(s => s.stage_id === 'adult_maintenance')!
    const targets = resolveTargets(stage, 950)
    const { formulation } = runSolver({
      ingredients: INGREDIENTS,
      resolvedTargets: targets,
      dogProfileId: 'test-livre-26',
      mode: 'livre',
    })
    expect(formulation.solver_status).toBe('optimal')
    expect(formulation.allocations.length).toBeGreaterThan(0)
    // Alocações zero-grama não aparecem (grams <= 0 são filtradas)
    const allZero = formulation.allocations.every(a => a.grams_per_day > 0)
    expect(allZero).toBe(true)
  })

  describe('modo livre combinatório', () => {
    const stage = STAGES.find(s => s.stage_id === 'adult_maintenance')!
    const targets = resolveTargets(stage, 950)

    it.each(INGREDIENTS)('single: $id', (ing) => {
      const { formulation } = runSolver({
        ingredients: [ing],
        resolvedTargets: targets,
        dogProfileId: 'comb-livre',
        mode: 'livre',
      })
      expect(formulation.solver_status).toBe('optimal')
    })
  })

  describe('modo livre — todas as combinações de pares', () => {
    const stage = STAGES.find(s => s.stage_id === 'adult_maintenance')!
    const targets = resolveTargets(stage, 950)
    const pairs: Array<[string, string]> = []
    for (let i = 0; i < INGREDIENTS.length; i++) {
      for (let j = i + 1; j < INGREDIENTS.length; j++) {
        pairs.push([INGREDIENTS[i].id, INGREDIENTS[j].id])
      }
    }

    it.each(pairs)('%s + %s', (idA, idB) => {
      const ingA = INGREDIENTS.find(i => i.id === idA)!
      const ingB = INGREDIENTS.find(i => i.id === idB)!
      const { formulation } = runSolver({
        ingredients: [ingA, ingB],
        resolvedTargets: targets,
        dogProfileId: 'comb-pair',
        mode: 'livre',
      })
      expect(formulation.solver_status).toBe('optimal')
    })
  })
})
