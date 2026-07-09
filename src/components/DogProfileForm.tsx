import { useState, type FormEvent } from 'react'
import type { DogProfile, LifeStage, ActivityLevel, ReproductiveStatus } from '../types'
import { Card } from './ui/Card'

interface Props {
  initial?: Partial<DogProfile>
  onSave: (profile: DogProfile) => void
  onCancel?: () => void
}

function uid() { return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }

export function DogProfileForm({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [weight, setWeight] = useState(String(initial?.weight_kg ?? 30))
  const [age, setAge] = useState(String(initial?.age_months ?? 24))
  const [lifeStage, setLifeStage] = useState<LifeStage>(initial?.life_stage ?? 'adult')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(initial?.activity_level ?? 'moderate')
  const [reproStatus, setReproStatus] = useState<ReproductiveStatus>(initial?.reproductive_status ?? 'intact')
  const [bcs, setBcs] = useState(String(initial?.body_condition_score ?? 5))
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Nome é obrigatório'
    const w = parseFloat(weight)
    if (isNaN(w) || w <= 0) e.weight = 'Peso deve ser maior que 0'
    const a = parseFloat(age)
    if (isNaN(a) || a < 0) e.age = 'Idade inválida'
    const b = parseInt(bcs)
    if (isNaN(b) || b < 1 || b > 9) e.bcs = 'BCS deve ser entre 1 e 9'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const profile: DogProfile = {
      id: initial?.id ?? uid(),
      name: name.trim(),
      breed: 'Pastor Alemão',
      weight_kg: parseFloat(weight),
      age_months: parseFloat(age),
      life_stage: lifeStage,
      activity_level: activityLevel,
      reproductive_status: reproStatus,
      body_condition_score: parseInt(bcs),
      health_conditions: initial?.health_conditions ?? [],
    }
    onSave(profile)
  }

  return (
    <Card title={initial?.id ? 'Editar perfil' : 'Novo perfil'}>
      <form onSubmit={handleSubmit} className="profile-form" noValidate>
        <div className="form-group">
          <label htmlFor="name">Nome do cão</label>
          <input
            id="name" type="text" value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: Thor"
            aria-describedby={errors.name ? 'name-error' : undefined}
            aria-invalid={!!errors.name}
          />
          {errors.name && <span id="name-error" className="field-error" role="alert">{errors.name}</span>}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="weight">Peso (kg)</label>
            <input
              id="weight" type="number" value={weight} min="1" max="100" step="0.1"
              onChange={e => setWeight(e.target.value)}
              aria-invalid={!!errors.weight}
            />
            {errors.weight && <span className="field-error" role="alert">{errors.weight}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="age">Idade (meses)</label>
            <input
              id="age" type="number" value={age} min="0" max="240" step="1"
              onChange={e => setAge(e.target.value)}
              aria-invalid={!!errors.age}
            />
            {errors.age && <span className="field-error" role="alert">{errors.age}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="bcs">
              BCS{' '}
              <abbr title="Escore de Condição Corporal: 1=Emaciado, 5=Ideal, 9=Obeso">(?)</abbr>
            </label>
            <input
              id="bcs" type="number" value={bcs} min="1" max="9" step="1"
              onChange={e => setBcs(e.target.value)}
              aria-invalid={!!errors.bcs}
            />
            {errors.bcs && <span className="field-error" role="alert">{errors.bcs}</span>}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="life-stage">Estágio de vida</label>
            <select id="life-stage" value={lifeStage} onChange={e => setLifeStage(e.target.value as LifeStage)}>
              <option value="puppy_early">Filhote 0–4 meses</option>
              <option value="puppy_late">Filhote 4–18 meses</option>
              <option value="adult">Adulto</option>
              <option value="senior">Sênior</option>
              <option value="gestation">Gestação</option>
              <option value="lactation">Lactação</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="activity">Nível de atividade</label>
            <select id="activity" value={activityLevel} onChange={e => setActivityLevel(e.target.value as ActivityLevel)}>
              <option value="sedentary">Sedentário</option>
              <option value="low">Baixo</option>
              <option value="moderate">Moderado</option>
              <option value="active">Ativo</option>
              <option value="working">Trabalho</option>
              <option value="performance">Performance</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="repro">Status reprodutivo</label>
            <select id="repro" value={reproStatus} onChange={e => setReproStatus(e.target.value as ReproductiveStatus)}>
              <option value="intact">Inteiro(a)</option>
              <option value="neutered">Castrado(a)</option>
              <option value="pregnant">Prenha</option>
              <option value="lactating">Lactante</option>
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary">Salvar perfil</button>
          {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>}
        </div>
      </form>
    </Card>
  )
}
