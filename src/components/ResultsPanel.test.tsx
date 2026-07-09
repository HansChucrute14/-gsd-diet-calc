// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ResultsPanel } from './ResultsPanel'
import type { Formulation } from '../types'

vi.mock('../db/database', () => ({
  exportAll: () => Promise.resolve('{}'),
}))

const MINIMAL_FORMULATION: Formulation = {
  id: 'test_formulation',
  dog_profile_id: 'test_dog',
  stage_id: 'adult_maintenance',
  created_at: '2026-07-09T00:00:00Z',
  allocations: [{ ingredient_id: 'chicken_breast', grams_per_day: 100, pct_of_diet: 100, kcal_contribution: 165 }],
  nutrient_results: [],
  solver_status: 'optimal',
  solver_message: undefined,
  total_grams_per_day: 100,
  total_kcal_per_day: 165,
  energy_density_kcal_per_g: 1.65,
  reconciliation_warnings: [],
  coverage_excluded_nutrients: [],
}

afterEach(cleanup)

describe('ResultsPanel', () => {
  it('renderiza empty state quando não há resultados', () => {
    render(<ResultsPanel formulation={MINIMAL_FORMULATION} der_kcal={300} rer_kcal={250} stage_id="adult_maintenance" />)
    expect(screen.getByText('Nenhum resultado nutricional disponível.')).toBeDefined()
  })

  it('renderiza summary header com dados de estágio', () => {
    render(
      <ResultsPanel
        formulation={{
          ...MINIMAL_FORMULATION,
          nutrient_results: [{ nutrient_id: 'protein', amount_per_day: 50, unit: 'g', status: 'ok', pct_of_min: 120 }],
        }}
        der_kcal={300}
        rer_kcal={250}
        stage_id="adult_maintenance"
      />
    )
    expect(screen.getByText('adult_maintenance')).toBeDefined()
    expect(screen.getByText(/250 kcal\/dia/)).toBeDefined()
    expect(screen.getByText(/300 kcal\/dia/)).toBeDefined()
    expect(screen.getByText(/100g \/ 165 kcal/)).toBeDefined()
    expect(screen.getByText(/1.65 kcal\/g/)).toBeDefined()
    expect(screen.getByText('Ótimo')).toBeDefined()
  })

  it('renderiza tabs e alterna conteúdo', () => {
    const formulation: Formulation = {
      ...MINIMAL_FORMULATION,
      nutrient_results: [
        { nutrient_id: 'protein', amount_per_day: 50, unit: 'g', status: 'ok', pct_of_min: 120 },
      ],
      reconciliation_warnings: ['teste de aviso'],
    }
    render(<ResultsPanel formulation={formulation} der_kcal={300} rer_kcal={250} stage_id="adult_maintenance" />)
    expect(screen.getByRole('tablist')).toBeDefined()
    expect(screen.getByText('Dieta')).toBeDefined()
    expect(screen.getByText('Nutrientes')).toBeDefined()
    expect(screen.getByText(/Avisos \(1\)/)).toBeDefined()
  })
})
