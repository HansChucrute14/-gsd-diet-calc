import { useState, useMemo } from 'react'
import { INGREDIENTS } from '../data/loaders'
import type { IngredientDisplayData } from '../types'
import { Card } from './ui/Card'

interface Props {
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

const CATEGORY_LABELS: Record<string, string> = {
  muscle_meat:   'Carne muscular',
  organ_offal:   'Vísceras / Órgãos',
  raw_meaty_bone:'Ossos carnudos crus',
  vegetable_fiber:'Vegetais / Fibra',
  fat_source:    'Fontes de gordura',
  supplement:    'Suplementos',
}

export function IngredientSelector({ selectedIds, onChange }: Props) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const categories = useMemo(
    () => Array.from(new Set(INGREDIENTS.map(i => i.category))).sort(),
    [],
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return INGREDIENTS.filter(i => {
      const matchCat = categoryFilter === 'all' || i.category === categoryFilter
      const matchQ = !q || i.name.toLowerCase().includes(q) || i.id.includes(q)
      return matchCat && matchQ
    })
  }, [search, categoryFilter])

  const allFilteredSelected = filtered.every(i => selectedIds.includes(i.id))

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter(x => x !== id)
        : [...selectedIds, id],
    )
  }

  function toggleAll() {
    if (allFilteredSelected) {
      onChange(selectedIds.filter(id => !filtered.some(i => i.id === id)))
    } else {
      const newIds = new Set([...selectedIds, ...filtered.map(i => i.id)])
      onChange(Array.from(newIds))
    }
  }

  function selectAll() { onChange(INGREDIENTS.map(i => i.id)) }
  function clearAll()  { onChange([]) }

  return (
    <Card title="Selecionar ingredientes">
      <div className="ingredient-controls">
        <input
          type="search"
          placeholder="Buscar ingrediente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Buscar ingrediente"
          className="search-input"
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          aria-label="Filtrar por categoria"
        >
          <option value="all">Todas as categorias</option>
          {categories.map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
          ))}
        </select>
        <div className="ingredient-bulk-actions">
          <button type="button" className="btn-link" onClick={selectAll}>Todos</button>
          <button type="button" className="btn-link" onClick={clearAll}>Nenhum</button>
          <span className="selection-count">
            {selectedIds.length === 0 ? 'Todos os ' : `${selectedIds.length}/`}{INGREDIENTS.length} ingredientes
          </span>
        </div>
      </div>

      <div className="ingredient-list" role="group" aria-label="Lista de ingredientes">
        <label className="ingredient-item ingredient-item--header">
          <input
            type="checkbox"
            checked={allFilteredSelected && filtered.length > 0}
            onChange={toggleAll}
            aria-label="Selecionar todos os filtrados"
          />
          <span className="ing-name"><strong>Selecionar todos ({filtered.length})</strong></span>
        </label>

        {filtered.map(ing => (
          <IngredientRow
            key={ing.id}
            ingredient={ing}
            selected={selectedIds.includes(ing.id)}
            onToggle={() => toggle(ing.id)}
          />
        ))}

        {filtered.length === 0 && (
          <p className="empty-state" role="status">Nenhum ingrediente encontrado.</p>
        )}
      </div>
    </Card>
  )
}

interface RowProps {
  ingredient: IngredientDisplayData
  selected: boolean
  onToggle: () => void
}

function IngredientRow({ ingredient: ing, selected, onToggle }: RowProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`ingredient-item ${selected ? 'ingredient-item--selected' : ''}`}>
      <label className="ingredient-label">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Selecionar ${ing.name}`}
        />
        <span className="ing-name">{ing.name}</span>
        <span className="ing-category">{CATEGORY_LABELS[ing.category] ?? ing.category}</span>
        {ing.palatability_and_feasibility && (
          <span
            className="ing-score"
            title="Pontuação de palatabilidade"
            aria-label={`Palatabilidade: ${ing.palatability_and_feasibility.score}/10`}
          >
            ★ {ing.palatability_and_feasibility.score}
          </span>
        )}
        <span className="ing-kcal">{ing.kcal_per_100g} kcal/100g</span>
      </label>

      <button
        type="button"
        className="btn-expand"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-controls={`ing-detail-${ing.id}`}
      >
        {expanded ? '▲' : '▼'}
      </button>

      {expanded && (
        <div id={`ing-detail-${ing.id}`} className="ingredient-detail">
          {ing.palatability_and_feasibility && (
            <p className="ing-analysis">{ing.palatability_and_feasibility.critical_analysis}</p>
          )}
          {ing.safety_alerts && ing.safety_alerts.length > 0 && (
            <ul className="safety-alerts" aria-label="Alertas de segurança">
              {ing.safety_alerts.map((a, i) => (
                <li key={i} className={`alert alert-${a.type}`}>
                  <strong>{a.risk}</strong> — {a.mitigation}
                </li>
              ))}
            </ul>
          )}
          <p className="ing-constraints">
            Inclusão: {ing.lp_constraints.min_inclusion_pct}–{ing.lp_constraints.max_inclusion_pct}%
            {ing.price_per_kg && ` · R$ ${ing.price_per_kg.value.toFixed(2)}/kg`}
          </p>
        </div>
      )}
    </div>
  )
}
