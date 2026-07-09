import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ingredients = require('../src/data/generated/ingredients.json')
const stages = require('../src/data/generated/stages.json')
const solver = require('javascript-lp-solver')

const derKcal = 1458  // 30kg adult moderate

const UNIT_MAP = {
  'g_per_1000kcal':  1/1000,
  'mg_per_1000kcal': 1/1000,
  'IU_per_1000kcal': 1/1000,
  'ug_per_1000kcal': 1/1000,
}

const NUTRIENT_TO_FIELD = {
  protein:'protein_g', fat:'fat_g', calcium:'calcium_mg', phosphorus:'phosphorus_mg',
  sodium:'sodium_mg', potassium:'potassium_mg', magnesium:'magnesium_mg',
  zinc:'zinc_mg', iron:'iron_mg', copper:'copper_mg', iodine:'iodine_ug',
  selenium:'selenium_ug', vitamin_a:'vitamin_a_iu', vitamin_d:'vitamin_d_iu',
  vitamin_e:'vitamin_e_mg', thiamin:'thiamin_mg', riboflavin:'riboflavin_mg',
  niacin:'niacin_mg', cobalamin:'vitamin_b12_ug', epa_dha:'omega_3_epa_dha_g',
}
const FIELD_SCALE = { vitamin_b12_ug:0.001, selenium_ug:0.001, iodine_ug:0.001, chromium_ug:0.001 }

function perGram(per100g, nutrientId) {
  const fk = NUTRIENT_TO_FIELD[nutrientId]
  if (!fk) return 0
  const raw = per100g[fk] ?? 0
  const sc = FIELD_SCALE[fk] ?? 1
  return (raw / 100) * sc
}

const stage = stages.find(s => s.stage_id === 'adult_maintenance')
const targets = stage.targets
  .filter(t => UNIT_MAP[t.unit])
  .map(t => ({
    nutrient_id: t.nutrient_id,
    min: t.value_min !== undefined ? t.value_min * UNIT_MAP[t.unit] * derKcal : undefined,
    max: t.value_max !== undefined ? t.value_max * UNIT_MAP[t.unit] * derKcal : undefined,
  }))

console.log(`\n── Stage: ${stage.stage_id} | DER: ${derKcal} kcal ──`)
console.log(`Targets resolved: ${targets.length}`)
console.log('Sample (protein, calcium, zinc, epa_dha):')
;['protein','calcium','zinc','epa_dha'].forEach(nid => {
  const t = targets.find(x => x.nutrient_id === nid)
  if (t) console.log(`  ${nid}: min=${t.min?.toFixed(3)} max=${t.max?.toFixed(3)}`)
})

// Build LP with ALL ingredients to test full feasibility
const selected = ingredients

function varName(id) { return id.replace(/[^a-z0-9_]/gi, '_') }

const variables = {}
const constraints = {}
const totalVar = '__total__'

selected.forEach(ing => {
  variables[varName(ing.id)] = { cost: 0.05 }
})
variables[totalVar] = { cost: 0 }

// T = Σxi
selected.forEach(ing => { variables[varName(ing.id)]['total_eq'] = -1 })
variables[totalVar]['total_eq'] = 1
constraints['total_eq'] = { min: 0, max: 0 }

// total grams 200–1000
selected.forEach(ing => { variables[varName(ing.id)]['total_g'] = 1 })
constraints['total_g'] = { min: 200, max: 1000 }

// nutrient constraints (all resolved targets)
targets.forEach(t => {
  const ck = `nut_${t.nutrient_id}`
  selected.forEach(ing => {
    const pg = perGram(ing.per_100g_as_fed, t.nutrient_id)
    if (pg) variables[varName(ing.id)][ck] = (variables[varName(ing.id)][ck] ?? 0) + pg
  })
  if (t.min !== undefined || t.max !== undefined) {
    constraints[ck] = {}
    if (t.min !== undefined) constraints[ck].min = t.min
    if (t.max !== undefined) constraints[ck].max = t.max
  }
})

// inclusion %
selected.forEach(ing => {
  const vn = varName(ing.id)
  const maxPct = ing.lp_constraints.max_inclusion_pct / 100
  variables[vn][`inc_${vn}`] = 1
  variables[totalVar][`inc_${vn}`] = -maxPct
  constraints[`inc_${vn}`] = { max: 0 }
})

// NON-NEGATIVITY: x_i >= 0 for all ingredients
selected.forEach(ing => {
  const vn = varName(ing.id)
  variables[vn][`lb_${vn}`] = 1
  constraints[`lb_${vn}`] = { min: 0 }
})
variables[totalVar]['lb_total'] = 1
constraints['lb_total'] = { min: 0 }

const model = { optimize:'cost', opType:'min', constraints, variables }
const result = solver.Solve(model)

console.log(`\n── Solver result ──`)
console.log('feasible:', result.feasible)
console.log('result:', JSON.stringify(result, null, 2))
