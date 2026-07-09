import { z } from 'zod'

// ---------------------------------------------------------------------------
// Source / Evidence
// ---------------------------------------------------------------------------
export const SourceSchema = z.object({
  citation: z.string(),
  evidence_tier: z.enum(['TIER_S', 'TIER_A', 'TIER_B', 'TIER_C', 'estimated_from_categorical_mapping']),
  url: z.string().optional(),
  date_verified: z.string().optional(),
})
export type Source = z.infer<typeof SourceSchema>

// ---------------------------------------------------------------------------
// Nutrient Registry
// ---------------------------------------------------------------------------
export const NutrientDefinitionSchema = z.object({
  id: z.string(),
  label_pt: z.string(),
  unit_canonical: z.enum(['g', 'mg', 'IU', 'ug']),
  clinical_criticality: z.enum(['critical', 'important', 'desirable']),
  has_safety_ceiling: z.boolean(),
})
export type NutrientDefinition = z.infer<typeof NutrientDefinitionSchema>

// ---------------------------------------------------------------------------
// Ingredient — raw bromatology per 100g as-fed
// ---------------------------------------------------------------------------
export const Per100gSchema = z.record(z.string(), z.number())
export type Per100g = z.infer<typeof Per100gSchema>

export const LpConstraintsSchema = z.object({
  max_inclusion_pct: z.number().min(0).max(100),
  min_inclusion_pct: z.number().min(0).max(100),
})
export type LpConstraints = z.infer<typeof LpConstraintsSchema>

export const SafetyAlertSchema = z.object({
  type: z.enum(['microbiological', 'chemical', 'chemical_toxicity', 'physical']),
  risk: z.string(),
  mitigation: z.string(),
})

export const BioavailabilityFactorsSchema = z.object({
  zinc_absorption: z.number().min(0).max(1).optional(),
  calcium_absorption: z.number().min(0).max(1).optional(),
  iron_absorption: z.number().min(0).max(1).optional(),
  phytate_penalty: z.boolean().optional(),
  oxalate_penalty: z.boolean().optional(),
  ala_to_epa_dha_conversion: z.number().min(0).max(1).optional(),
  requires_stomach_acid: z.boolean().optional(),
  dmt1_competition_factor: z.number().min(0).optional(),
  factor_source_tier: z.enum([
    'TIER_S', 'TIER_A', 'TIER_B', 'TIER_C', 'estimated_from_categorical_mapping'
  ]),
})
export type BioavailabilityFactors = z.infer<typeof BioavailabilityFactorsSchema>

// Categorical bioavailability from Source B
export const BioavailabilityCategorialSchema = z.object({
  iron_type: z.string().optional(),
  zinc_absorption_factor: z.string().optional(),
  calcium_absorption_factor: z.string().optional(),
  anti_nutrient_interactions: z.string().optional(),
})

export const IngredientDisplayDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum([
    'muscle_meat', 'organ_offal', 'raw_meaty_bone',
    'vegetable_fiber', 'fat_source', 'supplement',
  ]),
  per_100g_as_fed: Per100gSchema,
  kcal_per_100g: z.number().positive(),
  price_per_kg: z.object({
    value: z.number().nonnegative(),
    currency: z.string(),
    updated_at: z.string().optional(),
  }).optional(),
  lp_constraints: LpConstraintsSchema,
  palatability_and_feasibility: z.object({
    score: z.number().min(0).max(10),
    critical_analysis: z.string(),
  }).optional(),
  safety_alerts: z.array(SafetyAlertSchema).optional(),
  processing_notes: z.array(z.object({ note: z.string() })).optional(),
  amino_acid_profile_notes: z.object({
    limiting_amino_acids: z.array(z.string()),
    specific_strengths: z.array(z.string()),
  }).optional(),
  bioavailability_and_absorption: BioavailabilityCategorialSchema.optional(),
  metadata: z.object({
    version: z.string().optional(),
    source: z.array(SourceSchema).optional(),
    last_reviewed_date: z.string().optional(),
  }).optional(),
})

// V5 extension — adds numeric bioavailability_factors + extra fields
export const IngredientDisplayDataSchemaV5 = IngredientDisplayDataSchema.extend({
  molar_mass_g_per_mol: z.record(z.string(), z.number()).optional(),
  bioavailability_factors: BioavailabilityFactorsSchema.optional(),
})
export type IngredientDisplayData = z.infer<typeof IngredientDisplayDataSchemaV5>

// ---------------------------------------------------------------------------
// Categorical → numeric fallback (tier: estimated_from_categorical_mapping)
// ---------------------------------------------------------------------------
export const CATEGORICAL_TO_NUMERIC_FALLBACK: Record<string, number> = {
  High: 0.80,
  Moderate: 0.40,
  Low: 0.15,
  'Very Low': 0.05,
  Negligible: 0.02,
  heme: 0.25,
  'non-heme': 0.05,
}

// ---------------------------------------------------------------------------
// Requirement Stages
// ---------------------------------------------------------------------------
export const AbsoluteDailyTargetSchema = z.object({
  nutrient_id: z.string(),
  min: z.number().nonnegative().optional(),
  max: z.number().positive().optional(),
  target: z.number().nonnegative().optional(),
  unit: z.string(),
  source: z.array(SourceSchema).optional(),
})
export type AbsoluteDailyTarget = z.infer<typeof AbsoluteDailyTargetSchema>

export const GlobalFormulationConstraintSchema = z.object({
  constraint_id: z.literal('energy_density'),
  value_min_kcal_per_gram: z.number().positive(),
  value_max_kcal_per_gram: z.number().positive(),
  source: z.array(SourceSchema).optional(),
})
export type GlobalFormulationConstraint = z.infer<typeof GlobalFormulationConstraintSchema>

// Ca:P and other ratio constraints derived from two nutrients
export const DerivedRatioConstraintSchema = z.object({
  constraint_id: z.string(),
  numerator_nutrient_id: z.string(),
  denominator_nutrient_id: z.string(),
  min_ratio: z.number().positive().optional(),
  max_ratio: z.number().positive().optional(),
  source: z.array(SourceSchema).optional(),
})
export type DerivedRatioConstraint = z.infer<typeof DerivedRatioConstraintSchema>

export const RequirementStageSchema = z.object({
  stage_id: z.string(),
  label_pt: z.string(),
  targets: z.array(AbsoluteDailyTargetSchema),
  global_constraints: z.array(GlobalFormulationConstraintSchema).optional(),
  ratio_constraints: z.array(DerivedRatioConstraintSchema).optional(),
})
export type RequirementStage = z.infer<typeof RequirementStageSchema>

// ---------------------------------------------------------------------------
// Dog Profile
// ---------------------------------------------------------------------------
export const ReproductiveStatusSchema = z.enum([
  'intact', 'neutered', 'pregnant', 'lactating'
])
export type ReproductiveStatus = z.infer<typeof ReproductiveStatusSchema>

export const ActivityLevelSchema = z.enum([
  'sedentary', 'low', 'moderate', 'active', 'working', 'performance'
])
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>

export const LifeStageSchema = z.enum([
  'puppy_early',    // 0–4 months large breed
  'puppy_late',     // 4–12 months large breed
  'adult',
  'senior',
  'gestation',
  'lactation',
])
export type LifeStage = z.infer<typeof LifeStageSchema>

export const HealthConditionSchema = z.object({
  condition_id: z.enum([
    'hip_dysplasia',
    'elbow_dysplasia',
    'exocrine_pancreatic_insufficiency',
    'degenerative_myelopathy',
    'zinc_responsive_dermatosis',
    'hypothyroidism',
    'ibd',
    'urolithiasis_calcium_oxalate',
    'renal_insufficiency',
    'none',
  ]),
  severity: z.enum(['mild', 'moderate', 'severe']).optional(),
})
export type HealthCondition = z.infer<typeof HealthConditionSchema>

export const DogProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  breed: z.string().default('Pastor Alemão'),
  weight_kg: z.number().positive(),
  age_months: z.number().nonnegative(),
  life_stage: LifeStageSchema,
  reproductive_status: ReproductiveStatusSchema,
  activity_level: ActivityLevelSchema,
  health_conditions: z.array(HealthConditionSchema).default([]),
  body_condition_score: z.number().min(1).max(9).default(5),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})
export type DogProfile = z.infer<typeof DogProfileSchema>

// ---------------------------------------------------------------------------
// Formulation (solver output)
// ---------------------------------------------------------------------------
export const IngredientAllocationSchema = z.object({
  ingredient_id: z.string(),
  grams_per_day: z.number().nonnegative(),
  pct_of_diet: z.number().nonnegative(),
  kcal_contribution: z.number().nonnegative(),
})
export type IngredientAllocation = z.infer<typeof IngredientAllocationSchema>

export const NutrientResultSchema = z.object({
  nutrient_id: z.string(),
  amount_per_day: z.number(),
  unit: z.string(),
  pct_of_min: z.number().optional(),
  pct_of_max: z.number().optional(),
  status: z.enum(['ok', 'deficient', 'excess', 'unchecked']),
})
export type NutrientResult = z.infer<typeof NutrientResultSchema>

export const FormulationModeSchema = z.enum(['livre', 'otimo'])
export type FormulationMode = z.infer<typeof FormulationModeSchema>

export const IngredientSuggestionSchema = z.object({
  ingredient_id: z.string(),
  reason_nutrient_id: z.string(),
  shortfall_amount: z.number(),
})
export type IngredientSuggestion = z.infer<typeof IngredientSuggestionSchema>

export const FormulationSchema = z.object({
  id: z.string(),
  dog_profile_id: z.string(),
  stage_id: z.string(),
  created_at: z.string(),
  total_grams_per_day: z.number().nonnegative(),
  total_kcal_per_day: z.number().nonnegative(),
  energy_density_kcal_per_g: z.number().nonnegative(),
  allocations: z.array(IngredientAllocationSchema),
  nutrient_results: z.array(NutrientResultSchema),
  solver_status: z.enum(['optimal', 'infeasible', 'error']),
  solver_message: z.string().optional(),
  reconciliation_warnings: z.array(z.string()).default([]),
  coverage_excluded_nutrients: z.array(z.string()).default([]),
  coverage_pct: z.record(z.string(), z.number()).optional(),
  achieved: z.record(z.string(), z.number()).optional(),
  total_cost: z.number().nonnegative().optional(),
  mode: FormulationModeSchema.optional(),
  suggested_ingredients: z.array(IngredientSuggestionSchema).optional(),
})
export type Formulation = z.infer<typeof FormulationSchema>

// ---------------------------------------------------------------------------
// Goal Programming / CoverageGate / OptimizeResult (v6 §6)
// ---------------------------------------------------------------------------

export const CRITICALITY_WEIGHT: Record<string, number> = {
  critical: 100,
  important: 10,
  desirable: 1,
}

export interface DryRunResult {
  valid: boolean
  missing_nutrients: string[]
  insufficient_nutrients: string[]
  excluded_from_this_run: string[]
}

export type OptimizeResult =
  | { success: true; formulation: Formulation; achieved: Record<string, number>; coverage_pct: Record<string, number>; total_cost: number }
  | { success: false; error_type: 'INFEASIBLE' | 'SOLVER_ERROR' | 'DRY_RUN_FAILED'; message: string; details: DryRunResult | null }

// ---------------------------------------------------------------------------
// Biometry
// ---------------------------------------------------------------------------
export interface BiometryResult {
  rer_kcal: number
  der_kcal: number
  target_weight_kg: number
  multiplier_used: number
  stage_id: string
}
