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
| 2026-07-09 | v6.8.0 — Formulation modes | Modo Livre (todos slack) + Modo Ótimo (hard constraints c/ safety ceilings); sugestões em infeasible; filtro 0.5g removido. 41 testes engine (11 suites). |
| 2026-07-09 | Movido para raiz | `gsd-diet-calc/` → raiz do repo para deploy Netlify |

## Arquitetura

```
├── dist/                   — Build output (JS bundle 355K, CSS 9K, PWA files)
├── public/                 — favicon, icons (copied to dist/ by vite)
├── scripts/                — reconcileIngredientSources, parseMdBlocks, debugSolver
├── src/
│   ├── engine/
│   │   ├── solver.ts      — LP solver wrapper (javascript-lp-solver) c/ mode-aware slack
│   │   ├── solver.worker.ts — Web Worker wrapper para runSolver
│   │   ├── workerPool.ts  — Pool de workers (2 slots) com fila
│   │   ├── targets.ts     — Resolução de metas (per 1000 kcal → absoluto)
│   │   ├── biometry.ts    — Cálculo DER/RER
│   │   └── index.ts       — Função formulate() (orquestração)
│   ├── data/
│   │   ├── nutrientRegistry.ts — Mapeamento nutrient_id ↔ raw_field_key (38 nutrientes)
│   │   ├── loaders.ts     — Load + validação estrutural de dados JSON
│   │   └── generated/     — Dados reconciliados (ingredients.json, stages.json)
│   ├── components/
│   │   ├── ResultsPanel.tsx — Painel de resultados c/ mode badge + sugestões
│   │   ├── ui/
│   │   │   ├── Badge.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── CoverageBanner.tsx
│   │   └── FreshnessBanner.tsx
│   ├── hooks/
│   │   ├── useFormulator.ts — Hook que orquestra formulate() c/ mode
│   │   └── useProfiles.ts — CRUD perfis (Dexie)
│   ├── db/
│   │   └── database.ts    — Dexie IndexedDB schema + CRUD
│   ├── types/
│   │   └── index.ts       — Schemas Zod (FormulationMode, IngredientSuggestion, etc.)
│   ├── App.tsx            — Componente principal c/ seletor de modo
│   ├── main.tsx           — Entry point React
│   ├── index.css          — Estilos app
│   └── style.css          — Estilos base
├── CONTEXT_MAP.md         — Eventos e arquitetura do projeto
├── project_state_map.json — Snapshot completo do estado do projeto
├── *.config.ts            — vite, vitest, tsconfig
└── package.json
```

## Testes

- **41 testes engine**, 11 suites
- `npx vitest run` — todos verdes
- `npx tsc --noEmit` — clean

## Project State Map

- `project_state_map.json` — documento auto-suficiente para retomada do projeto por agente LLM
- Contém: manifesto completo, roles, dados, testes, implementação, histórico, planos futuros

## Fixes Aplicados (v6.8)

| ID | Descrição | Arquivo |
|----|-----------|---------|
| M1 | FormulationMode (livre/otimo) | types/index.ts, solver.ts, engine/index.ts, useFormulator.ts, App.tsx |
| M2 | Mode-aware slack: livre=todos slack, otimo=só desirable | solver.ts |
| M3 | Safety ceilings sempre hard em otimo | solver.ts |
| M4 | suggestMissingIngredients() em otimo infeasible | solver.ts |
| M5 | Filtro 0.5g → grams <= 0 | solver.ts |
| M6 | Mode badge + sugestões no ResultsPanel | ResultsPanel.tsx |
| M7 | 4 testes modo-specific (1 ingrediente livre, 1 otimo infeasible, 26 otimo, 26 livre) | engine.test.ts |
