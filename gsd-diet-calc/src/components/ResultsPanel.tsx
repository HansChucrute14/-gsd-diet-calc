import { useState } from 'react'
import type { Formulation, NutrientResult } from '../types'
import { NUTRIENT_REGISTRY } from '../data/nutrientRegistry'
import { INGREDIENTS } from '../data/loaders'
import { Badge } from './ui/Badge'
import { Card } from './ui/Card'
import { CoverageBanner } from './ui/CoverageBanner'
import { FreshnessBanner } from './ui/FreshnessBanner'
import { checkDataFreshness } from '../data/freshness'
import { exportAll } from '../db/database'

interface Props {
  formulation: Formulation
  der_kcal: number
  rer_kcal: number
  stage_id: string
}

const STATUS_VARIANT: Record<NutrientResult['status'], 'ok' | 'deficient' | 'excess' | 'warning' | 'neutral'> = {
  ok: 'ok',
  deficient: 'deficient',
  excess: 'excess',
  unchecked: 'neutral',
}

export function ResultsPanel({ formulation, der_kcal, rer_kcal, stage_id }: Props) {
  const [tab, setTab] = useState<'diet' | 'nutrients' | 'warnings'>('diet')

  if (formulation.nutrient_results.length === 0) {
    return (
      <div className="results-panel">
        <p className="empty-state" role="status">Nenhum resultado nutricional disponível.</p>
      </div>
    )
  }

  const freshnessWarnings = checkDataFreshness(INGREDIENTS)

  const criticalNutrients = formulation.nutrient_results.filter(
    n => NUTRIENT_REGISTRY[n.nutrient_id]?.clinical_criticality === 'critical'
  )
  const deficientCount = formulation.nutrient_results.filter(n => n.status === 'deficient').length
  const excessCount = formulation.nutrient_results.filter(n => n.status === 'excess').length
  const warningCount = formulation.reconciliation_warnings.length

  async function handleExport() {
    const json = await exportAll()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dieta_gsd_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="results-panel">
      {/* Summary header */}
      <Card className="results-summary">
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">Estágio</span>
            <span className="summary-value">{stage_id}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">RER</span>
            <span className="summary-value">{rer_kcal} kcal/dia</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">DER</span>
            <span className="summary-value">{der_kcal} kcal/dia</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total</span>
            <span className="summary-value">{formulation.total_grams_per_day}g / {formulation.total_kcal_per_day} kcal</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Densidade</span>
            <span className="summary-value">{formulation.energy_density_kcal_per_g} kcal/g</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Status</span>
            <Badge
              label={formulation.solver_status === 'optimal' ? 'Ótimo' : formulation.solver_status === 'infeasible' ? 'Inviável' : formulation.solver_status}
              variant={formulation.solver_status === 'optimal' ? 'ok' : 'deficient'}
            />
          </div>
        </div>

        {formulation.mode && (
          <Badge
            label={formulation.mode === 'livre' ? 'Modo Livre' : 'Modo Ótima'}
            variant={formulation.mode === 'livre' ? 'neutral' : 'ok'}
          />
        )}

        {formulation.solver_status === 'infeasible' && formulation.solver_message && (
          <div className="solver-error" role="alert">
            <strong>⚠ Solver:</strong> {formulation.solver_message}
          </div>
        )}

        {formulation.solver_status === 'infeasible' && formulation.suggested_ingredients && formulation.suggested_ingredients.length > 0 && (
          <div className="suggestions-box" role="alert">
            <strong>💡 Sugestões de ingredientes:</strong>
            <ul>
              {formulation.suggested_ingredients.map((s, i) => {
                const ing = INGREDIENTS.find(i => i.id === s.ingredient_id)
                const nut = NUTRIENT_REGISTRY[s.reason_nutrient_id]
                return (
                  <li key={i}>
                    <strong>{ing?.name ?? s.ingredient_id}</strong> — fornece <strong>{nut?.label_pt ?? s.reason_nutrient_id}</strong>
                    {' (déficit de '}{s.shortfall_amount}{' '}{nut?.unit_canonical ?? ''}/dia)
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </Card>

      {/* CoverageGate banner */}
      <CoverageBanner excludedNutrients={formulation.coverage_excluded_nutrients} nutrientLabels={NUTRIENT_REGISTRY} />

      {/* Freshness banner */}
      {freshnessWarnings.length > 0 && <FreshnessBanner warnings={freshnessWarnings} />}

      {/* Quick status badges */}
      <div className="status-row" role="status" aria-live="polite">
        {deficientCount > 0 && <Badge label={`${deficientCount} nutriente(s) deficiente(s)`} variant="deficient" />}
        {excessCount > 0 && <Badge label={`${excessCount} nutriente(s) em excesso`} variant="excess" />}
        {warningCount > 0 && <Badge label={`${warningCount} aviso(s)`} variant="warning" />}
        {deficientCount === 0 && excessCount === 0 && warningCount === 0 && (
          <Badge label="Todos os nutrientes dentro dos limites" variant="ok" />
        )}
      </div>

      {/* Critical nutrient quick view */}
      {criticalNutrients.some(n => n.status !== 'ok' && n.status !== 'unchecked') && (
        <div className="critical-alert" role="alert">
          <strong>Nutrientes críticos fora do intervalo:</strong>
          <ul>
            {criticalNutrients
              .filter(n => n.status !== 'ok' && n.status !== 'unchecked')
              .map(n => (
                <li key={n.nutrient_id}>
                  <Badge label={n.status === 'deficient' ? 'Deficiente' : 'Excesso'} variant={STATUS_VARIANT[n.status]} />
                  {' '}{NUTRIENT_REGISTRY[n.nutrient_id]?.label_pt ?? n.nutrient_id}
                  {': '}{n.amount_per_day.toFixed(3)} {n.unit}/dia
                  {n.pct_of_min !== undefined && ` (${n.pct_of_min}% do mínimo)`}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Tabs */}
      <div className="results-tabs" role="tablist">
        {([['diet', 'Dieta'], ['nutrients', 'Nutrientes'], ['warnings', `Avisos (${warningCount})`]] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`tab-btn ${tab === key ? 'tab-btn--active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Diet */}
      {tab === 'diet' && (
        <Card title="Composição da dieta">
          <table className="diet-table" aria-label="Ingredientes da dieta">
            <thead>
              <tr>
                <th scope="col">Ingrediente</th>
                <th scope="col">Gramas/dia</th>
                <th scope="col">% da dieta</th>
                <th scope="col">kcal</th>
              </tr>
            </thead>
            <tbody>
              {formulation.allocations.map(a => {
                const ing = INGREDIENTS.find(i => i.id === a.ingredient_id)
                return (
                  <tr key={a.ingredient_id}>
                    <td>{ing?.name ?? a.ingredient_id}</td>
                    <td>{a.grams_per_day}g</td>
                    <td>
                      <div className="progress-bar" title={`${a.pct_of_diet}%`}>
                        <div className="progress-fill" style={{ width: `${Math.min(a.pct_of_diet, 100)}%` }} />
                        <span>{a.pct_of_diet}%</span>
                      </div>
                    </td>
                    <td>{a.kcal_contribution} kcal</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Tab: Nutrients */}
      {tab === 'nutrients' && (
        <Card title="Perfil nutricional">
          <table className="nutrient-table" aria-label="Resultados nutricionais">
            <thead>
              <tr>
                <th scope="col">Nutriente</th>
                <th scope="col">Valor/dia</th>
                <th scope="col">% do mínimo</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {formulation.nutrient_results
                .filter(n => n.amount_per_day > 0 || n.status !== 'unchecked')
                .sort((a, b) => {
                  const order = { critical: 0, important: 1, desirable: 2 }
                  const ca = NUTRIENT_REGISTRY[a.nutrient_id]?.clinical_criticality ?? 'desirable'
                  const cb = NUTRIENT_REGISTRY[b.nutrient_id]?.clinical_criticality ?? 'desirable'
                  return order[ca] - order[cb]
                })
                .map(n => (
                  <tr key={n.nutrient_id} className={`row-${n.status}`}>
                    <td>
                      {NUTRIENT_REGISTRY[n.nutrient_id]?.label_pt ?? n.nutrient_id}
                      {NUTRIENT_REGISTRY[n.nutrient_id]?.clinical_criticality === 'critical' && (
                        <span className="critical-marker" aria-label="Nutriente crítico"> ★</span>
                      )}
                    </td>
                    <td>{n.amount_per_day.toFixed(3)} {n.unit}</td>
                    <td>
                      {n.pct_of_min !== undefined ? (
                        <div className="progress-bar" title={`${n.pct_of_min}% do mínimo`}>
                          <div
                            className={`progress-fill progress-fill--${n.status}`}
                            style={{ width: `${Math.min(n.pct_of_min, 200)}%`, maxWidth: '100%' }}
                          />
                          <span>{n.pct_of_min}%</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      <Badge
                        label={n.status === 'ok' ? 'OK' : n.status === 'deficient' ? 'Deficiente' : n.status === 'excess' ? 'Excesso' : '—'}
                        variant={STATUS_VARIANT[n.status]}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="legend">★ Nutriente de criticidade clínica crítica</p>
        </Card>
      )}

      {/* Tab: Warnings */}
      {tab === 'warnings' && (
        <Card title="Avisos e alertas">
          {formulation.reconciliation_warnings.length === 0 ? (
            <p className="empty-state" role="status">Nenhum aviso gerado para esta formulação.</p>
          ) : (
            <ul className="warning-list" aria-label="Lista de avisos">
              {formulation.reconciliation_warnings.map((w, i) => (
                <li key={i} className="warning-item" role="alert">{w}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="results-actions">
        <button type="button" className="btn-secondary" onClick={handleExport}>
          Exportar dados (JSON)
        </button>
      </div>
    </div>
  )
}
