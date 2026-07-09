import { useState } from 'react'
import { DogProfileForm } from './components/DogProfileForm'
import { IngredientSelector } from './components/IngredientSelector'
import { ResultsPanel } from './components/ResultsPanel'
import { Card } from './components/ui/Card'
import { useProfiles } from './hooks/useProfiles'
import { useFormulator } from './hooks/useFormulator'
import { importAll } from './db/database'
import type { DogProfile, FormulationMode } from './types'
import { INGREDIENTS } from './data/loaders'

type AppView = 'home' | 'new-profile' | 'edit-profile' | 'formulate'

export default function App() {
  const { profiles, loading: profilesLoading, save, remove } = useProfiles()
  const { formulation, loading: solverLoading, error, der_kcal, rer_kcal, stage_id, run, reset } = useFormulator()

  const [view, setView] = useState<AppView>('home')
  const [editingProfile, setEditingProfile] = useState<DogProfile | null>(null)
  const [activeProfile, setActiveProfile] = useState<DogProfile | null>(null)
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([])
  const [formulationMode, setFormulationMode] = useState<FormulationMode>('livre')
  const [importError, setImportError] = useState<string | null>(null)

  async function handleProfileSave(p: DogProfile) {
    await save(p)
    setView('home')
    setEditingProfile(null)
  }

  function startFormulate(profile: DogProfile) {
    setActiveProfile(profile)
    setSelectedIngredients([])  // default: all ingredients
    reset()
    setView('formulate')
  }

  async function handleFormulate() {
    if (!activeProfile) return
    await run(activeProfile, selectedIngredients, undefined, undefined, formulationMode)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null)
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const result = await importAll(text)
      alert(`Importado: ${result.profiles} perfil(is), ${result.formulations} formulação(ões).`)
      e.target.value = ''
    } catch {
      setImportError('Arquivo inválido. Verifique se é um export da Calculadora GSD.')
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Calculadora de Dieta Crua Canina</h1>
        <p className="app-subtitle">Pastor Alemão · Baseado em evidências NRC/FEDIAF</p>
      </header>

      <nav className="app-nav" aria-label="Navegação principal">
        <button
          className={`nav-btn ${view === 'home' ? 'nav-btn--active' : ''}`}
          onClick={() => { setView('home'); reset() }}
        >
          Perfis
        </button>
        {activeProfile && view === 'formulate' && (
          <span className="nav-breadcrumb">→ {activeProfile.name}</span>
        )}
      </nav>

      <main className="app-main">

        {/* ── HOME: profile list ── */}
        {view === 'home' && (
          <div className="home-view">
            <div className="home-actions">
              <button className="btn-primary" onClick={() => setView('new-profile')}>
                + Novo perfil
              </button>
              <label className="btn-secondary import-btn">
                Importar dados
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  style={{ display: 'none' }}
                  aria-label="Importar arquivo JSON"
                />
              </label>
              {importError && <span className="field-error" role="alert">{importError}</span>}
            </div>

            {profilesLoading ? (
              <p className="loading" role="status" aria-live="polite">Carregando perfis...</p>
            ) : profiles.length === 0 ? (
              <Card>
                <p className="empty-state">
                  Nenhum perfil cadastrado. Crie o primeiro perfil do seu cão para começar.
                </p>
              </Card>
            ) : (
              <div className="profile-grid" role="list" aria-label="Lista de perfis">
                {profiles.map(p => (
                  <Card key={p.id} className="profile-card">
                    <div role="listitem">
                      <h3 className="profile-name">{p.name}</h3>
                      <dl className="profile-meta">
                        <dt>Peso</dt><dd>{p.weight_kg} kg</dd>
                        <dt>Idade</dt><dd>{p.age_months} meses</dd>
                        <dt>BCS</dt><dd>{p.body_condition_score}/9</dd>
                        <dt>Estágio</dt><dd>{p.life_stage}</dd>
                        <dt>Atividade</dt><dd>{p.activity_level}</dd>
                      </dl>
                      <div className="profile-actions">
                        <button className="btn-primary" onClick={() => startFormulate(p)}>
                          Formular dieta
                        </button>
                        <button className="btn-secondary" onClick={() => {
                          setEditingProfile(p)
                          setView('edit-profile')
                        }}>
                          Editar
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => {
                            if (confirm(`Excluir perfil "${p.name}"? Todas as formulações serão perdidas.`)) {
                              void remove(p.id)
                            }
                          }}
                          aria-label={`Excluir perfil ${p.name}`}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── NEW / EDIT PROFILE ── */}
        {(view === 'new-profile' || view === 'edit-profile') && (
          <DogProfileForm
            initial={editingProfile ?? undefined}
            onSave={handleProfileSave}
            onCancel={() => { setView('home'); setEditingProfile(null) }}
          />
        )}

        {/* ── FORMULATE ── */}
        {view === 'formulate' && activeProfile && (
          <div className="formulate-view">
            <div className="formulate-left">
              <Card title="Perfil ativo">
                <dl className="profile-meta">
                  <dt>Nome</dt><dd>{activeProfile.name}</dd>
                  <dt>Peso</dt><dd>{activeProfile.weight_kg} kg (BCS {activeProfile.body_condition_score})</dd>
                  <dt>Idade</dt><dd>{activeProfile.age_months} meses</dd>
                  <dt>Estágio</dt><dd>{activeProfile.life_stage}</dd>
                  <dt>Atividade</dt><dd>{activeProfile.activity_level}</dd>
                </dl>
              </Card>

              <IngredientSelector
                selectedIds={selectedIngredients}
                onChange={setSelectedIngredients}
              />

              <div className="mode-selector">
                <span className="mode-label">Modo de formulação:</span>
                <label className={`mode-radio ${formulationMode === 'livre' ? 'mode-radio--active' : ''}`}>
                  <input
                    type="radio"
                    name="mode"
                    value="livre"
                    checked={formulationMode === 'livre'}
                    onChange={() => setFormulationMode('livre')}
                  />
                  <span className="mode-radio-label">Livre</span>
                  <span className="mode-radio-desc">Usa ingredientes selecionados, mostra deficiências</span>
                </label>
                <label className={`mode-radio ${formulationMode === 'otimo' ? 'mode-radio--active' : ''}`}>
                  <input
                    type="radio"
                    name="mode"
                    value="otimo"
                    checked={formulationMode === 'otimo'}
                    onChange={() => setFormulationMode('otimo')}
                  />
                  <span className="mode-radio-label">Ótima</span>
                  <span className="mode-radio-desc">Atende todas as necessidades ao menor custo</span>
                </label>
              </div>

              <div className="formulate-actions">
                <button
                  className="btn-primary btn-large"
                  onClick={handleFormulate}
                  disabled={solverLoading}
                  aria-busy={solverLoading}
                >
                  {solverLoading ? 'Calculando...' : `Formular dieta (${selectedIngredients.length === 0 ? INGREDIENTS.length : selectedIngredients.length} ingredientes)`}
                </button>
              </div>

              {error && (
                <div className="solver-error" role="alert">
                  <strong>Erro:</strong> {error}
                </div>
              )}
            </div>

            <div className="formulate-right">
              {formulation && der_kcal && rer_kcal && stage_id ? (
                <ResultsPanel
                  formulation={formulation}
                  der_kcal={der_kcal}
                  rer_kcal={rer_kcal}
                  stage_id={stage_id}
                />
              ) : (
                <Card>
                  <p className="empty-state">
                    {solverLoading
                      ? 'O solver está calculando a formulação ótima...'
                      : 'Selecione os ingredientes e clique em "Formular dieta" para começar.'}
                  </p>
                </Card>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>
          Dados baseados em NRC (2006), FEDIAF (2024), TBCA-USP 7.3 e USDA FoodData Central.
          Esta ferramenta é de apoio à decisão — consulte um médico-veterinário nutricionista.
        </p>
      </footer>
    </div>
  )
}
