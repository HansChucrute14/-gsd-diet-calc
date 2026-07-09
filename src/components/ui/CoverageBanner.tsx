interface Props {
  excludedNutrients: string[]
  nutrientLabels?: Record<string, { label_pt: string; unit_canonical: string }>
}

export function CoverageBanner({ excludedNutrients, nutrientLabels }: Props) {
  if (excludedNutrients.length === 0) return null

  const lookup = (id: string) => nutrientLabels?.[id] ?? { label_pt: id, unit_canonical: '?' }

  return (
    <div className="coverage-banner" role="alert">
      <div className="coverage-banner__header">
        <span className="coverage-banner__icon" aria-hidden="true">⚠</span>
        <span>Dados insuficientes para {excludedNutrients.length} nutriente{excludedNutrients.length !== 1 ? 's' : ''}</span>
      </div>
      <p className="coverage-banner__body">
        {excludedNutrients.length} nutriente{excludedNutrients.length !== 1 ? 's' : ''} sem cobertura nos ingredientes selecionados
        — {excludedNutrients.length !== 1 ? 'as restrições não foram aplicadas' : 'a restrição não foi aplicada'} nesta formulação.
      </p>
      <ul className="coverage-banner__list">
        {excludedNutrients.map(id => (
          <li key={id}>
            {lookup(id).label_pt}
            <span className="coverage-banner__unit">({lookup(id).unit_canonical})</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
