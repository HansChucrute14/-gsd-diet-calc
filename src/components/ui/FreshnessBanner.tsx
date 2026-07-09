import type { FreshnessWarning } from '../../data/freshness'

interface Props {
  warnings: FreshnessWarning[]
}

export function FreshnessBanner({ warnings }: Props) {
  if (warnings.length === 0) return null

  return (
    <div className="freshness-banner" role="alert">
      <div className="freshness-banner__header">
        <span className="freshness-banner__icon" aria-hidden="true">⏳</span>
        <span>Dados desatualizados em {warnings.length} ingrediente{warnings.length !== 1 ? 's' : ''}</span>
      </div>
      <p className="freshness-banner__body">
        {warnings.length !== 1 ? 'Os seguintes ingredientes não são revisados há mais de 12 meses:' : 'O seguinte ingrediente não é revisado há mais de 12 meses:'}
      </p>
      <ul className="freshness-banner__list">
        {warnings.map(w => (
          <li key={w.ingredient_id}>
            {w.ingredient_name}
            <span className="freshness-banner__days">({w.days_since_review} dias desde a última revisão: {w.last_reviewed_date})</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
