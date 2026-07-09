/**
 * parseMdBlocks.ts
 * Parses the structured YAML-like blocks from the .md source files.
 * Handles the known inconsistencies:
 *   - name_pt vs name (normalised to `name`)
 *   - energy_density filtered out of REQUIREMENT_STAGE targets → GlobalFormulationConstraint
 *   - calcium_phosphorus_ratio filtered out → DerivedRatioConstraint
 *   - value: "unverified" → undefined (skipped)
 */

import * as fs from 'fs'
import * as path from 'path'
// Note: __dirname not available in ESM; callers pass absolute paths

// ── Types (lightweight — full Zod validation happens in reconcile step) ────

export interface RawPer100g {
  kcal?: number
  [key: string]: number | undefined
}

export interface RawIngredient {
  id: string
  name: string
  category: string
  per_100g_as_fed: RawPer100g
  kcal_per_100g: number
  lp_constraints: { max_inclusion_pct: number; min_inclusion_pct: number }
  molar_mass_g_per_mol?: Record<string, number>
  bioavailability_factors?: Record<string, unknown>
  bioavailability_and_absorption?: Record<string, string>
  palatability_and_feasibility?: { score: number; critical_analysis: string }
  safety_alerts?: Array<{ type: string; risk: string; mitigation: string }>
  processing_notes?: Array<{ note: string }>
  amino_acid_profile_notes?: { limiting_amino_acids: string[]; specific_strengths: string[] }
  price_per_kg?: { value: number; currency: string; updated_at?: string }
  metadata?: {
    version?: string
    source?: Array<{ citation: string; evidence_tier: string; url?: string; date_verified?: string }>
    last_reviewed_date?: string
  }
  _source_file?: string
}

export interface RawTarget {
  nutrient_id: string
  value_min?: number
  value_max?: number
  unit: string
  source?: Array<{ citation: string; evidence_tier: string }>
}

export interface RawEnergyDensityConstraint {
  value_min: number
  value_max: number
  source?: Array<{ citation: string; evidence_tier: string }>
}

export interface RawRatioConstraint {
  nutrient_id: string
  value_min?: number
  value_max?: number
  unit: string
  source?: Array<{ citation: string; evidence_tier: string }>
}

export interface RawStage {
  stage_id: string
  applicable_to?: string
  age_months_min?: number
  age_months_max?: number
  targets: RawTarget[]
  energy_density_constraint?: RawEnergyDensityConstraint
  ratio_constraints?: RawRatioConstraint[]
  _source_file?: string
}

// ── YAML-lite helpers ────────────────────────────────────────────────────────

function stripComment(line: string): string {
  const idx = line.indexOf('#')
  // only strip if '#' is not inside quotes
  if (idx === -1) return line
  if (line[idx - 1] === ' ' || idx === 0) return line.slice(0, idx).trimEnd()
  return line
}

function indent(line: string): number {
  let i = 0
  while (i < line.length && line[i] === ' ') i++
  return i
}

/**
 * Minimal YAML parser for the subset used in these files.
 * Handles: scalars, quoted strings, arrays of objects (block style), nested objects.
 * NOT a general YAML parser — only handles the exact structures present in the .md files.
 */
function parseYamlBlock(lines: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  let i = 0

  while (i < lines.length) {
    const line = stripComment(lines[i])
    if (!line.trim()) { i++; continue }

    const ind = indent(line)
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) { i++; continue }

    const key = line.slice(ind, colonIdx).trim()
    const rest = line.slice(colonIdx + 1).trim()

    if (rest === '' || rest === '|' || rest === '>') {
      // look ahead: array or nested object?
      const nextNonEmpty = lines.slice(i + 1).find(l => l.trim() !== '')
      if (nextNonEmpty?.trimStart().startsWith('- ')) {
        // array of objects
        const arr: Record<string, unknown>[] = []
        i++
        while (i < lines.length) {
          const ln = lines[i]
          if (!ln.trim()) { i++; continue }
          if (indent(ln) <= ind && !ln.trimStart().startsWith('- ')) break
          if (ln.trimStart().startsWith('- ')) {
            const childLines: string[] = [ln.replace(/^\s*- /, ' '.repeat(indent(ln) + 2))]
            i++
            while (i < lines.length) {
              const peek = lines[i]
              if (!peek.trim()) { i++; continue }
              if (peek.trimStart().startsWith('- ') && indent(peek) === indent(ln)) break
              if (indent(peek) <= ind && !peek.trimStart().startsWith('- ')) break
              childLines.push(peek)
              i++
            }
            arr.push(parseYamlBlock(childLines))
          } else {
            break
          }
        }
        result[key] = arr
      } else {
        // nested object
        const childLines: string[] = []
        i++
        while (i < lines.length) {
          const ln = lines[i]
          if (!ln.trim()) { i++; continue }
          if (indent(ln) <= ind) break
          childLines.push(ln)
          i++
        }
        result[key] = parseYamlBlock(childLines)
      }
    } else {
      // scalar value
      result[key] = parseScalar(rest)
      i++
    }
  }

  return result
}

export function parseScalar(s: string): unknown {
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null' || s === '~') return null
  if (s === 'unverified') return undefined  // explicit skip for malformed data
  // quoted string
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  // number
  const n = Number(s)
  if (!isNaN(n) && s !== '') return n
  return s
}

// ── Block extractor ──────────────────────────────────────────────────────────

export type BlockType = 'INGREDIENT' | 'REQUIREMENT_STAGE' | 'DOCUMENT_HEADER' | 'METHODOLOGY_NOTES' | 'CLINICAL_PROTOCOL' | 'unknown'

export interface RawBlock {
  type: BlockType
  id: string
  lines: string[]
  source_file: string
}

export function extractBlocks(mdContent: string, sourceFile: string): RawBlock[] {
  const blocks: RawBlock[] = []
  const lines = mdContent.split('\n')
  let current: RawBlock | null = null

  const BLOCK_HEADER = /^(?:###\s+)?(INGREDIENT|REQUIREMENT_STAGE|DOCUMENT_HEADER|METHODOLOGY_NOTES|CLINICAL_PROTOCOL):\s*(\S+)/

  for (const line of lines) {
    const match = line.match(BLOCK_HEADER)
    if (match) {
      if (current) blocks.push(current)
      current = {
        type: match[1] as BlockType,
        id: match[2],
        lines: [],
        source_file: sourceFile,
      }
    } else if (line.startsWith('---') || line.startsWith('***')) {
      // section separator — close current block if open
      if (current) { blocks.push(current); current = null }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current) blocks.push(current)

  return blocks
}

// ── Ingredient parser ────────────────────────────────────────────────────────

export function parseIngredientBlock(block: RawBlock): RawIngredient | null {
  const yaml = parseYamlBlock(block.lines)

  // Extract kcal from per_100g_as_fed.kcal (Source B style) or the top-level
  const per100Raw = (yaml['per_100g_as_fed'] ?? {}) as Record<string, unknown>
  const kcal = typeof per100Raw['kcal'] === 'number' ? per100Raw['kcal'] : 0

  // Build clean per_100g without the kcal key (kcal is a top-level field)
  const per_100g_as_fed: RawPer100g = {}
  for (const [k, v] of Object.entries(per100Raw)) {
    if (k !== 'kcal' && typeof v === 'number') per_100g_as_fed[k] = v
  }

  const lpRaw = (yaml['lp_constraints'] ?? {}) as Record<string, unknown>

  // Normalise name: name_pt (Source A) → name
  const name = (yaml['name'] ?? yaml['name_pt'] ?? block.id) as string

  // price_per_kg: may be nested object
  let price_per_kg: RawIngredient['price_per_kg'] | undefined
  if (yaml['price_per_kg'] && typeof yaml['price_per_kg'] === 'object') {
    const p = yaml['price_per_kg'] as Record<string, unknown>
    if (typeof p['value'] === 'number') {
      price_per_kg = {
        value: p['value'] as number,
        currency: (p['currency'] ?? 'BRL') as string,
        updated_at: p['updated_at'] as string | undefined,
      }
    }
  }

  // metadata.source — from top-level `source:` array or metadata.source
  let metaSource: RawIngredient['metadata'] = undefined
  const topSource = yaml['source'] ?? yaml['metadata']
  if (topSource && typeof topSource === 'object') {
    if (Array.isArray(topSource)) {
      metaSource = { source: topSource as NonNullable<RawIngredient['metadata']>['source'] }
    } else {
      metaSource = topSource as RawIngredient['metadata']
    }
  }

  // bioavailability_factors (Source A numeric)
  let bioavailability_factors: RawIngredient['bioavailability_factors'] | undefined
  if (yaml['bioavailability_factors'] && typeof yaml['bioavailability_factors'] === 'object') {
    bioavailability_factors = yaml['bioavailability_factors'] as Record<string, unknown>
  }

  // bioavailability_and_absorption (Source B categorical)
  let bioavailability_and_absorption: RawIngredient['bioavailability_and_absorption'] | undefined
  if (yaml['bioavailability_and_absorption'] && typeof yaml['bioavailability_and_absorption'] === 'object') {
    bioavailability_and_absorption = yaml['bioavailability_and_absorption'] as Record<string, string>
  }

  // palatability_and_feasibility
  let pal: RawIngredient['palatability_and_feasibility'] | undefined
  if (yaml['palatability_and_feasibility'] && typeof yaml['palatability_and_feasibility'] === 'object') {
    const p = yaml['palatability_and_feasibility'] as Record<string, unknown>
    pal = { score: p['score'] as number, critical_analysis: (p['critical_analysis'] ?? '') as string }
  } else if (yaml['clinical_notes']) {
    // Source A has clinical_notes instead of palatability.critical_analysis
    pal = { score: 5, critical_analysis: yaml['clinical_notes'] as string }
  }

  const ing: RawIngredient = {
    id: block.id,
    name,
    category: (yaml['category'] ?? 'supplement') as string,
    kcal_per_100g: kcal,
    per_100g_as_fed,
    lp_constraints: {
      max_inclusion_pct: typeof lpRaw['max_inclusion_pct'] === 'number' ? lpRaw['max_inclusion_pct'] : 100,
      min_inclusion_pct: typeof lpRaw['min_inclusion_pct'] === 'number' ? lpRaw['min_inclusion_pct'] : 0,
    },
    molar_mass_g_per_mol: yaml['molar_mass_g_per_mol'] as Record<string, number> | undefined,
    bioavailability_factors,
    bioavailability_and_absorption,
    palatability_and_feasibility: pal,
    safety_alerts: (yaml['safety_alerts'] as RawIngredient['safety_alerts']) ?? undefined,
    processing_notes: (yaml['processing_notes'] as RawIngredient['processing_notes']) ?? undefined,
    amino_acid_profile_notes: (yaml['amino_acid_profile_notes'] as RawIngredient['amino_acid_profile_notes']) ?? undefined,
    price_per_kg,
    metadata: metaSource,
    _source_file: block.source_file,
  }

  return ing
}

// ── Stage parser ─────────────────────────────────────────────────────────────

export function parseStageBlock(block: RawBlock): RawStage | null {
  const yaml = parseYamlBlock(block.lines)
  const rawTargets = (yaml['targets'] ?? []) as Array<Record<string, unknown>>

  const targets: RawTarget[] = []
  let energy_density_constraint: RawEnergyDensityConstraint | undefined
  const ratio_constraints: RawRatioConstraint[] = []

  for (const t of rawTargets) {
    const nutrient_id = t['nutrient_id'] as string
    const unit = (t['unit'] ?? '') as string
    const raw_min = t['value_min']
    const raw_max = t['value_max']
    const value_min = typeof raw_min === 'number' ? raw_min : undefined
    const value_max = typeof raw_max === 'number' ? raw_max : undefined
    const source = t['source'] as RawTarget['source']

    // energy_density → GlobalFormulationConstraint (v5 Section 2 rule)
    if (nutrient_id === 'energy_density') {
      if (value_min !== undefined && value_max !== undefined) {
        energy_density_constraint = { value_min, value_max, source }
      }
      continue  // never enters targets array
    }

    // calcium_phosphorus_ratio → DerivedRatioConstraint
    if (nutrient_id === 'calcium_phosphorus_ratio') {
      ratio_constraints.push({ nutrient_id, value_min, value_max, unit, source })
      continue  // never enters targets array
    }

    // skip entries with no usable data (e.g. value_min: "unverified")
    if (value_min === undefined && value_max === undefined) continue

    targets.push({ nutrient_id, value_min, value_max, unit, source })
  }

  return {
    stage_id: block.id,
    applicable_to: yaml['applicable_to'] as string | undefined,
    age_months_min: yaml['age_months_min'] as number | undefined,
    age_months_max: yaml['age_months_max'] as number | undefined,
    targets,
    energy_density_constraint,
    ratio_constraints: ratio_constraints.length > 0 ? ratio_constraints : undefined,
    _source_file: block.source_file,
  }
}

// ── Public parse function ────────────────────────────────────────────────────

export interface ParsedFile {
  ingredients: RawIngredient[]
  stages: RawStage[]
  source_file: string
}

export function parseMdFile(filePath: string): ParsedFile {
  const content = fs.readFileSync(filePath, 'utf8')
  const blocks = extractBlocks(content, path.basename(filePath))

  const ingredients: RawIngredient[] = []
  const stages: RawStage[] = []

  for (const block of blocks) {
    if (block.type === 'INGREDIENT') {
      const ing = parseIngredientBlock(block)
      if (ing) ingredients.push(ing)
    } else if (block.type === 'REQUIREMENT_STAGE') {
      const stage = parseStageBlock(block)
      if (stage) stages.push(stage)
    }
  }

  return { ingredients, stages, source_file: path.basename(filePath) }
}
