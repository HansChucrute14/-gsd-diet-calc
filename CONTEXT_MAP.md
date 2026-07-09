# CONTEXT MAP — gsd-diet-calc

## v6 Milestone Events

| Data | Evento | Descrição |
|---|---|---|
| 2026-07-09 | Bugfix LP | NUTRIENT_TO_FIELD_MAP → Object.keys(NUTRIENT_REGISTRY) |
| 2026-07-09 | Vitest | Instalado vitest ^4.1.10, config, 19 testes (2 suites) |
| 2026-07-09 | lastSolvedModel | Bind fix para evitar redefinition error no ESM proxy |
| 2026-07-09 | CoverageGate | coverage_excluded_nutrients no schema + CoverageBanner UI |
| 2026-07-09 | AECL | logs/aecl_2026_07.md — sistema de log mensal |
| 2026-07-09 | Reconcile | npm run reconcile — 26 ingredientes, 5 estágios, 7 colisões |
| 2026-07-09 | Correções Sistêmicas | F1-F7-F3-F2-F6-F11-F24-F12-F16-F18-F21-F22 (12 fixes) |
| 2026-07-09 | Testes Essenciais | +10 testes: database-integrity, solver-exception, Ca:Zn, Iodo, BCS, age_months, bioavailability |
| 2026-07-09 | Project State Map | `project_state_map.json` — varredura completa (57 files, 14 categorias), testes, dados, plano futuro |
| 2026-07-09 | Goal Programming | solver objective refatorado: `min Σ weight_criticality×(sl_under+sl_over) + 0.001×cost` — desvio nutricional primeiro, custo tiebreaker |
| 2026-07-09 | F0.4 Schema Test | `types.test.ts` — documenta 26/26 ingredientes reais falham IngredientDisplayDataSchemaV5 |
| 2026-07-09 | Freshness Banner | `checkDataFreshness()`, `FreshnessBanner` — alerta de dados > 365 dias sem revisão |
| 2026-07-09 | OptimizeResult Wrapper | `wrapOptimizeResult()` additive — `Formulation → OptimizeResult` union, sem regressão |
| 2026-07-09 | Lote 2: Parser, UI, Worker | +18 testes (parser 6, banner 4, ResultsPanel 3, worker 2, engine 3), solver.worker.ts + workerPool.ts, guard duplicidade, jsdom config |
| 2026-07-09 | v6.7.0 — Slack variables | +6 slack vars (DER, density, Ca:P) resolvem `infeasible` com 1 ingrediente. 65 testes, 0 regressão |

## Arquitetura

```
gsd-diet-calc/
├── dist/                   — Build output (JS bundle 355K, CSS 9K, PWA files)
├── logs/                   — AECL (aecl_2026_07.md)
├── public/                 — favicon, icons (copied to dist/ by vite)
├── scripts/                — reconcileIngredientSources, parseMdBlocks, debugSolver
├── src/
│   ├── engine/
│   │   ├── solver.ts      — LP solver wrapper (javascript-lp-solver)
│   │   ├── solver.worker.ts — Web Worker wrapper para runSolver
│   │   ├── workerPool.ts  — Pool de workers (2 slots) com fila
│   │   ├── targets.ts     — Resolução de metas (per 1000 kcal → absoluto)
│   │   ├── biometry.ts    — Cálculo DER/RER
│   │   └── index.ts       — Função formulate() (orquestração)
│   ├── data/
│   │   ├── nutrientRegistry.ts — Mapeamento nutrient_id ↔ raw_field_key (38 nutrientes)
│   │   ├── loaders.ts     — Load + validação estrutural de dados JSON
│   │   └── generated/     — Dados reconciliados (ingredients.json, stages.json, reconciliation_report.json)
│   ├── components/
│   │   ├── ResultsPanel.tsx — Painel de resultados
│   │   ├── ui/
│   │   │   ├── Badge.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── CoverageBanner.tsx — Exibe nutrientes sem cobertura (desacoplado via props)
│   │   └── FreshnessBanner.tsx — Alerta de dados desatualizados (>365d sem revisão)
│   ├── hooks/
│   │   ├── useFormulator.ts — Hook que orquestra formulate()
│   │   └── useProfiles.ts — CRUD perfis (Dexie)
│   ├── db/
│   │   └── database.ts    — Dexie IndexedDB schema + CRUD
│   ├── types/
│   │   └── index.ts       — Schemas Zod (Formulation, DogProfile, etc.)
│   ├── App.tsx            — Componente principal (3 views)
│   ├── main.tsx           — Entry point React
│   ├── index.css          — Estilos app
│   └── style.css          — Estilos base
├── project_state_map.json — Snapshot completo do estado do projeto (57 files)
├── *.config.ts            — vite, vitest, tsconfig
└── package.json
```

## Testes

- **65 testes**, 10 suites (37 engine + 4 registry + 3 database-integrity + 1 solver-exception + 2 types + 3 freshness + 6 parser + 4 banner UI + 3 ResultsPanel + 2 worker pool)
- `npx vitest run` — todos verdes
- `npx tsc --noEmit` — clean

## Project State Map

- `project_state_map.json` — documento auto-suficiente para retomada do projeto por agente LLM
- Contém: manifesto completo (57 files), roles, dados, testes (38), implementação, histórico, planos futuros
- Gerado em 2026-07-09 via scan exaustivo do repositório

## Fixes Aplicados (Fase A–E)

| ID | Descrição | Arquivo |
|----|-----------|---------|
| F1 | kcal_per_100g ?? 0 + NaN guard | solver.ts |
| F2 | try-catch solver.Solve() → 'error' | solver.ts |
| F3 | Zod.parse → validateIngredients minimal | loaders.ts |
| F4 | Guard ingredientes vazios | engine/index.ts (já existia) |
| F5 | selectedIds vazio usa todos | Decisão (useFormulator.ts) |
| F6 | Ca:P coverage check | solver.ts |
| F7 | Integration test formulate() | engine.test.ts |
| F11 | raw_field_keys validation | loaders.ts |
| F12 | Dead code 'feasible' removido | types/index.ts |
| F16 | Comentário EPA+DHA corrigido | nutrientRegistry.ts |
| F18 | Coverage msg duplicada removida | solver.ts |
| F21 | Guard nutrient_results vazio | ResultsPanel.tsx |
| F22 | nutrientHasCoverage() compartilhada | solver.ts + targets.ts |
| F24 | CoverageBanner desacoplado | CoverageBanner.tsx + ResultsPanel.tsx |
| — | 3 testes pipeline integrity | database-integrity.test.ts |
| — | 1 teste solver exception (mock) | solver-exception.test.ts |
| — | 6 testes: Ca:Zn, Iodo, BCS, age_months, bioavailability | engine.test.ts |
| — | Project State Map (57 files, 14 categorias) | project_state_map.json |
| — | Goal Programming + dryRunValidation + OptimizeResult | solver.ts, types/index.ts |
| — | +7 testes: dryRun (3), goal programming (2), OptimizeResult (2) | engine.test.ts |
| — | F0.4 Schema test (2 testes) | types.test.ts |
| — | Freshness Banner + checkDataFreshness (3 testes) | freshness.ts, FreshnessBanner.tsx |
| — | wrapOptimizeResult additive (2 testes) | solver.ts, engine.test.ts |
| — | 6 parser tests (bareword, source, 2+ fontes) | parser.test.ts (novo) |
| — | 3 engine tests: sensibilidade, energy_density, coverage warnings + duplicidade | engine.test.ts |
| — | CoverageGate warnings push | solver.ts |
| — | Duplicate ID guard (primeiro vence, warn) | solver.ts |
| — | 4 UI tests: FreshnessBanner + CoverageBanner (jsdom) | BannerTests.test.tsx |
| — | 3 UI tests: ResultsPanel empty/summary/tabs (jsdom) | ResultsPanel.test.tsx |
| — | Web Worker + Worker Pool (2 tests) | solver.worker.ts, workerPool.ts |
| — | Slack DER (cost=100) + post-solve warnings (v6.7) | solver.ts |
| — | Slack energy density (cost=50) + post-solve warnings (v6.7) | solver.ts |
| — | Slack Ca:P ratio (cost=50) + post-solve warnings (v6.7) | solver.ts |
| — | 2 testes com ingredientes reais: broth DER slack + density slack (v6.7) | engine.test.ts |
