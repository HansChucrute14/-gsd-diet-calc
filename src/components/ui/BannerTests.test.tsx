// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { FreshnessBanner } from './FreshnessBanner'
import { CoverageBanner } from './CoverageBanner'

afterEach(cleanup)

describe('FreshnessBanner', () => {
  it('renderiza com warnings → alerta visível', () => {
    const warnings = [
      { ingredient_id: 'chicken_liver_raw', ingredient_name: 'Fígado de Frango', days_since_review: 400, last_reviewed_date: '2025-01-01' },
    ]
    render(<FreshnessBanner warnings={warnings} />)
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByText(/Fígado de Frango/)).toBeDefined()
    expect(screen.getByText(/400 dias/)).toBeDefined()
  })

  it('warnings vazio → não renderiza nada', () => {
    const { container } = render(<FreshnessBanner warnings={[]} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('CoverageBanner', () => {
  it('renderiza com excludedNutrients → alerta visível', () => {
    render(<CoverageBanner excludedNutrients={['selenium', 'vitamin_d']} />)
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByText(/selenium/)).toBeDefined()
    expect(screen.getByText(/vitamin_d/)).toBeDefined()
  })

  it('excludedNutrients vazio → não renderiza nada', () => {
    const { container } = render(<CoverageBanner excludedNutrients={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
