/**
 * reconcileIngredientSources.ts
 * 
 * Reads Source B (banco_de_dados_beta0_2.md) and Source A (COmplementar de estrategia v2.md),
 * reconciles them per the v5 Section 4 algorithm, and emits:
 *   - src/data/generated/ingredients.json   — merged ingredient array
 *   - src/data/generated/stages.json        — parsed requirement stages
 *   - src/data/generated/reconciliation_report.json
 * 
 * Run with: npm run reconcile
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { parseMdFile } from './parseMdBlocks'
import type { RawIngredient, RawStage } from './parseMdBlocks'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, '..')
const SOURCES_DIR = ROOT  // project root (markdown files live here)
const OUT_DIR = path.resolve(ROOT, 'src/data/generated')

const SOURCE_B_PATH = path.join(SOURCES_DIR, 'Banco_de_Dados_Beta v0.3 - Dados Completos.md')
const SOURCE_A_PATH = path.join(SOURCES_DIR, 'COmplementar de estrategia v2.md')

// ── Categorical→Numeric fallback (tier: estimated_from_categorical_mapping) ──
const CATEGORICAL_TO_NUMERIC: Record<string, number> = {
  'High': 0.80, 'Moderate': 0.40, 'Low': 0.15, 'Very Low': 0.05, 'Negligible': 0.02,
  'heme': 0.25, 'non-heme': 0.05,
}

function extractNumericFactor(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  // check for exact match first
  for (const [key, val] of Object.entries(CATEGORICAL_TO_NUMERIC)) {
    if (raw.toLowerCase().startsWith(key.toLowerCase())) return val
  }
  return undefined
}

// ── Reconciliation result types ──────────────────────────────────────────────

interface CollisionEntry {
  id: string
  field: string
  value_from_A: unknown
  value_from_B: unknown
  winner: 'A' | 'B'
}

interface FlagEntry {
  id: string
  issue: string
}

interface ReconciliationReport {
  generated_at: string
  source_A: string
  source_B: string
  ingredient_count_B: number
  ingredient_count_A_ingredients: number
  ingredient_count_merged: number
  stage_count: number
  collisions_resolved: CollisionEntry[]
  internal_inconsistencies_flagged: FlagEntry[]
  unit_corrections_applied: Array<{ stage_id: string; nutrient_id: string; old_min: unknown; old_max: unknown; new_min: unknown; new_max: unknown }>
}

// ── Main reconcile function ───────────────────────────────────────────────────

function reconcile() {
  // Validate source files exist
  for (const p of [SOURCE_B_PATH, SOURCE_A_PATH]) {
    if (!fs.existsSync(p)) {
      console.error(`ERROR: Source file not found: ${p}`)
      process.exit(1)
    }
  }

  console.log('Parsing Source B (Banco_de_Dados_Beta v0.3)...')
  const parsedB = parseMdFile(SOURCE_B_PATH)
  console.log(`  → ${parsedB.ingredients.length} ingredients, ${parsedB.stages.length} stages`)

  console.log('Parsing Source A (COmplementar de estrategia v2.md)...')
  const parsedA = parseMdFile(SOURCE_A_PATH)
  console.log(`  → ${parsedA.ingredients.length} ingredients, ${parsedA.stages.length} stages`)

  const collisions: CollisionEntry[] = []
  const flagged: FlagEntry[] = []

  // Step 1: Load B as base
  const byId = new Map<string, RawIngredient>()
  for (const ing of parsedB.ingredients) {
    byId.set(ing.id, ing)
  }

  // Step 2: Overlay A — A wins on collision (v5 Section 4 rule)
  for (const ingA of parsedA.ingredients) {
    if (byId.has(ingA.id)) {
      const ingB = byId.get(ingA.id)!

      // Check bromatological collisions (per_100g_as_fed numeric fields)
      for (const [key, valA] of Object.entries(ingA.per_100g_as_fed)) {
        const valB = ingB.per_100g_as_fed[key]
        if (valB !== undefined && Math.abs((valA ?? 0) - (valB ?? 0)) > 0.01) {
          collisions.push({
            id: ingA.id,
            field: `per_100g_as_fed.${key}`,
            value_from_A: valA,
            value_from_B: valB,
            winner: 'A',
          })
        }
      }

      // Check lp_constraints collision
      if (ingA.lp_constraints.max_inclusion_pct !== ingB.lp_constraints.max_inclusion_pct) {
        collisions.push({
          id: ingA.id,
          field: 'lp_constraints.max_inclusion_pct',
          value_from_A: ingA.lp_constraints.max_inclusion_pct,
          value_from_B: ingB.lp_constraints.max_inclusion_pct,
          winner: 'A',
        })
      }

      // Merge: A overwrites B field-by-field where A has a value
      const merged: RawIngredient = {
        ...ingB,
        ...Object.fromEntries(
          Object.entries(ingA).filter(([, v]) => v !== undefined && v !== null)
        ),
        // per_100g_as_fed: A fields win, B fills gaps
        per_100g_as_fed: { ...ingB.per_100g_as_fed, ...ingA.per_100g_as_fed },
        // lp_constraints: A always wins
        lp_constraints: ingA.lp_constraints,
      }
      byId.set(ingA.id, merged)
    } else {
      byId.set(ingA.id, ingA)
    }
  }

  // Step 3: Enrich bioavailability_factors from categorical where numeric is missing
  for (const ing of byId.values()) {
    if (!ing.bioavailability_factors && ing.bioavailability_and_absorption) {
      const cat = ing.bioavailability_and_absorption
      const zinc = extractNumericFactor(cat.zinc_absorption_factor)
      const calcium = extractNumericFactor(cat.calcium_absorption_factor)
      const iron = extractNumericFactor(cat.iron_type)
      if (zinc !== undefined || calcium !== undefined || iron !== undefined) {
        ing.bioavailability_factors = {
          zinc_absorption: zinc,
          calcium_absorption: calcium,
          iron_absorption: iron,
          factor_source_tier: 'estimated_from_categorical_mapping',
        }
      }
    }
  }

  // Step 4: Detect internal inconsistencies (prosa caution vs permissive lp_constraints)
  const cautionKeywords = ['apenas se', 'limitar', 'não exceder', 'restringir', 'usar apenas']
  for (const ing of byId.values()) {
    const analysis = (ing.palatability_and_feasibility?.critical_analysis ?? '').toLowerCase()
    const hasCaution = cautionKeywords.some(k => analysis.includes(k))
    if (hasCaution && ing.lp_constraints.max_inclusion_pct >= 50) {
      flagged.push({
        id: ing.id,
        issue: `critical_analysis sugere restrição mas max_inclusion_pct=${ing.lp_constraints.max_inclusion_pct} — revisar manualmente antes de promover a produção`,
      })
    }
    // Known specific case: beef_pancreas_raw in B had max=100, A corrects to 10
    // This is already handled by Step 2, but flag if it still slipped through
    if (ing.id === 'beef_pancreas_raw' && ing.lp_constraints.max_inclusion_pct >= 50) {
      flagged.push({
        id: ing.id,
        issue: 'beef_pancreas_raw: max_inclusion_pct still permissive after reconciliation — check that Source A override was applied correctly',
      })
    }
  }

  // Collect all stages (A is authoritative; B has none in this dataset)
  const allStages: RawStage[] = [...parsedB.stages, ...parsedA.stages]
  // Deduplicate by stage_id (A wins)
  const stageMap = new Map<string, RawStage>()
  for (const s of allStages) stageMap.set(s.stage_id, s)

  // Step 5: Normalise known unit errors in stage targets
  // The source document labels some mineral targets as mg_per_1000kcal but the
  // values are actually mg/kg DM from NRC 2006 Tables (factor ~4 difference).
  // Corrected values cross-checked against FEDIAF 2021 nutrient profiles (per 1000 kcal ME).
  // Only zinc requires correction; all other minerals are within FEDIAF bounds.
  const UNIT_CORRECTIONS: Record<string, Record<string, { min?: number; max?: number }>> = {
    // [stage_id]: { [nutrient_id]: { corrected min, max per 1000 kcal ME } }
    // Applied to all stages that contain the affected nutrient with the wrong value.
    '*': {  // '*' means apply to all stages
      zinc: { min: 20, max: 250 },  // source had 120/400 (those are mg/kg DM); FEDIAF: 20/250 mg/1000kcal
    },
  }

  const unitCorrectionLog: Array<{ stage_id: string; nutrient_id: string; old_min: unknown; old_max: unknown; new_min: unknown; new_max: unknown }> = []

  for (const stage of stageMap.values()) {
    const globalCorrections = UNIT_CORRECTIONS['*'] ?? {}
    const stageCorrections = UNIT_CORRECTIONS[stage.stage_id] ?? {}
    const allCorrections = { ...globalCorrections, ...stageCorrections }

    for (const target of stage.targets) {
      const correction = allCorrections[target.nutrient_id]
      if (!correction) continue
      if (correction.min !== undefined && target.value_min !== correction.min) {
        unitCorrectionLog.push({
          stage_id: stage.stage_id,
          nutrient_id: target.nutrient_id,
          old_min: target.value_min,
          old_max: target.value_max,
          new_min: correction.min,
          new_max: correction.max ?? target.value_max,
        })
        target.value_min = correction.min
        if (correction.max !== undefined) target.value_max = correction.max
      }
    }
  }

  // ── Write outputs ────────────────────────────────────────────────────────────

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const mergedIngredients = Array.from(byId.values())
  fs.writeFileSync(
    path.join(OUT_DIR, 'ingredients.json'),
    JSON.stringify(mergedIngredients, null, 2),
    'utf8',
  )
  console.log(`\n✓ Wrote ${mergedIngredients.length} ingredients → src/data/generated/ingredients.json`)

  const stages = Array.from(stageMap.values())
  fs.writeFileSync(
    path.join(OUT_DIR, 'stages.json'),
    JSON.stringify(stages, null, 2),
    'utf8',
  )
  console.log(`✓ Wrote ${stages.length} stages → src/data/generated/stages.json`)

  const report: ReconciliationReport = {
    generated_at: new Date().toISOString(),
    source_A: 'COmplementar de estrategia v2.md',
    source_B: 'Banco_de_Dados_Beta v0.3 - Dados Completos.md',
    ingredient_count_B: parsedB.ingredients.length,
    ingredient_count_A_ingredients: parsedA.ingredients.length,
    ingredient_count_merged: mergedIngredients.length,
    stage_count: stages.length,
    collisions_resolved: collisions,
    internal_inconsistencies_flagged: flagged,
    unit_corrections_applied: unitCorrectionLog,
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'reconciliation_report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  )
  console.log(`✓ Wrote reconciliation_report.json`)

  // Summary
  console.log('\n── Reconciliation Summary ────────────────────────────────')
  console.log(`  Ingredients (B): ${report.ingredient_count_B}`)
  console.log(`  Ingredients (A overrides): ${report.ingredient_count_A_ingredients}`)
  console.log(`  Merged total: ${report.ingredient_count_merged}`)
  console.log(`  Stages: ${report.stage_count}`)
  console.log(`  Collisions resolved: ${collisions.length}`)
  if (collisions.length > 0) {
    for (const c of collisions) {
      console.log(`    [COLLISION] ${c.id}.${c.field}: B=${c.value_from_B} → A=${c.value_from_A} (A wins)`)
    }
  }
  console.log(`  Inconsistencies flagged: ${flagged.length}`)
  if (flagged.length > 0) {
    for (const f of flagged) {
      console.log(`    [FLAG] ${f.id}: ${f.issue}`)
    }
  }
  console.log('\n⚠  Review reconciliation_report.json before promoting to production.')
}

reconcile()
