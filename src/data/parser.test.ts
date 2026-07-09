import { describe, it, expect } from 'vitest'
import { parseScalar, extractBlocks, parseIngredientBlock, parseStageBlock } from '../../scripts/parseMdBlocks'

describe('Parser — bareword e anomalias (v6 §9.9)', () => {
  it('parseScalar("unverified") retorna undefined (anomaly), nunca NaN', () => {
    const result = parseScalar('unverified')
    expect(result).toBeUndefined()
    expect(Number.isNaN(result)).toBe(false)
  })

  it('parseScalar("null") retorna null, valor bareword preservado', () => {
    const result = parseScalar('null')
    expect(result).toBeNull()
  })

  it('parseScalar("") retorna string vazia (não explode)', () => {
    const result = parseScalar('')
    expect(result).toBe('')
  })
})

describe('Parser — fonte e corroboração (v6 §13)', () => {
  it('bloco INGREDIENT sem source → metadata.source undefined', () => {
    const blocks = extractBlocks(
      '### INGREDIENT: test_ing\nname: Test\ncategory: muscle_meat\n',
      'test.md',
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('INGREDIENT')
    const ing = parseIngredientBlock(blocks[0])
    expect(ing).not.toBeNull()
    if (ing) {
      expect(ing.metadata?.source).toBeUndefined()
    }
  })

  it('bloco INGREDIENT com 1 source → source presente com 1 entrada', () => {
    const md = [
      '### INGREDIENT: test_ing',
      'name: Test',
      'category: muscle_meat',
      'source:',
      '  - citation: "NRC 2006"',
      '    evidence_tier: TIER_A',
      '',
    ].join('\n')
    const blocks = extractBlocks(md, 'test.md')
    const ing = parseIngredientBlock(blocks[0])
    expect(ing).not.toBeNull()
    if (ing) {
      expect(ing.metadata?.source).toHaveLength(1)
      expect(ing.metadata?.source![0].evidence_tier).toBe('TIER_A')
    }
  })

  it('bloco REQUIREMENT_STAGE com 2+ fontes → source tem ambas', () => {
    const md = [
      '### REQUIREMENT_STAGE: test_stage',
      'targets:',
      '  - nutrient_id: protein',
      '    value_min: 45',
      '    unit: g_per_1000kcal',
      '    source:',
      '      - citation: "FEDIAF 2024"',
      '        evidence_tier: TIER_S',
      '      - citation: "NRC 2006"',
      '        evidence_tier: TIER_A',
      '',
    ].join('\n')
    const blocks = extractBlocks(md, 'test.md')
    expect(blocks).toHaveLength(1)
    const stage = parseStageBlock(blocks[0])
    expect(stage).not.toBeNull()
    if (stage) {
      expect(stage.targets).toHaveLength(1)
      const t = stage.targets[0]
      expect(t.source).toHaveLength(2)
      expect(t.source![0].evidence_tier).toBe('TIER_S')
      expect(t.source![1].evidence_tier).toBe('TIER_A')
    }
  })
})
