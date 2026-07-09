# LLM Analysis Snapshot — gsd-diet-calc v6

> **Contexto:** App solo/MVP para Pastor Alemão (large breed). Futuramente open-source.
> **Formato:** Linguagem estruturada para parseamento por LLM. Cada finding tem avaliação crítica contextualizada.
> **Data:** 2026-07-09
> **Regra:** Nada será alterado neste snapshot. Apenas análise.

---

## META: Critérios de avaliação

Cada finding abaixo recebe três classificações:

| Campo | Valores | Significado |
|---|---|---|
| `bug_real` | `sim / nao / latente` | É um bug que afeta o usuário AGORA? `latente` = só ocorre em condições não correntes |
| `mvp_aceitavel` | `sim / nao / parcial` | É aceitável deixar como está para um MVP mono-usuário? |
| `pre_opensource` | `critical / high / medium / low / wontfix` | O quão crítico é resolver ANTES de abrir o código |

---

## FINDINGS

---

### F1. `solver.ts:229` — kcal_per_100g sem null-coalescing

**Localização:** `src/engine/solver.ts:229`
```typescript
totalKcal += grams * (ing.kcal_per_100g / 100)   // ← sem ?? 0
```

**Avaliação:**
- `bug_real: nao` — Todos os 26 ingredientes atuais têm `kcal_per_100g` definido. Dado gerado, não editado manualmente.
- `mvp_aceitavel: sim` — Enquanto o dataset for o gerado, não acontece.
- `pre_opensource: critical` — Se um usuário adicionar ingrediente sem `kcal_per_100g` (ou o parser falhar), `NaN` corrompe toda formulação sem warning.

**Recomendação:** Corrigir antes de abrir o código. Adicionar `?? 0` + warn se for 0.

---

### F2. `solver.ts:215` — solver.Solve() sem try-catch

**Localização:** `src/engine/solver.ts:215`

**Avaliação:**
- `bug_real: nao` — `javascript-lp-solver` é estável com modelos bem-formados. O modelo é construído pelo próprio app.
- `mvp_aceitavel: sim` — Risco baixíssimo com dados conhecidos.
- `pre_opensource: medium` — Usuários podem submeter dados corrompidos ou extremos. Um catch com `solver_status: 'error'` é barato e educado.

**Recomendação:** Adicionar try-catch antes de abrir. Não urgente.

---

### F3. `loaders.ts:16-17` — Casts inseguros (as unknown as)

**Localização:** `src/data/loaders.ts:16-17`

**Avaliação:**
- `bug_real: nao` — JSON é gerado pelo pipeline de build (`generate:data`), nunca editado manualmente. Os tipos sempre casam.
- `mvp_aceitavel: sim` — Pipeline fechado, sem intervenção manual.
- `pre_opensource: high` — Se usuários forem editar JSON manualmente ou plugar fontes externas, a validação zero é perigosa. Adicionar Zod `.parse()`.

**Recomendação:** Adicionar runtime validation (Zod) antes de abrir. Alternativa: documentar que JSON não deve ser editado manualmente.

---

### F4. `engine/index.ts` + `solver.ts` — Array vazio de ingredients

**Localização:** `src/engine/index.ts:52-58` (nenhuma guard)

**Avaliação:**
- `bug_real: nao` — O hook `useFormulator` sempre passa ingredientes (todos ou selecionados). UI nunca permite "0 ingredientes" porque o seletor padrão marca todos.
- `mvp_aceitavel: sim` — Caminho feliz sempre tem ingredientes.
- `pre_opensource: low` — Guard é trivial mas raramente triggered via UI normal. Mais relevante se expuserem API pública.

**Recomendação:** Adicionar guard simples antes de abrir, mas não prioritário.

---

### F5. `useFormulator.ts:30-32` — selectedIds vazio usa todos ingredientes

**Localização:** `src/hooks/useFormulator.ts:30-32`

**Avaliação:**
- `bug_real: nao` — Para MVP solo, é CONVENIENTE. Usuário abre o app, clica "formular", recebe uma dieta com todos ingredientes disponíveis. Zero atrito.
- `mvp_aceitavel: sim` — É uma feature para MVP, não um bug.
- `pre_opensource: medium` — Para open-source, `selectedIds = []` deveria ser erro ou exigir seleção explícita. Mas é decisão de UX, não bug.

**Recomendação:** Não mudar agora. Antes de abrir, decidir comportamento desejado e documentar.

---

### F6. `solver.ts:186-203` — Razão Ca:P silenciosamente bypassada

**Localização:** `src/engine/solver.ts:186-203`

**Comportamento:** Se Ca e P são 0 em todos ingredientes selecionados, a restrição `sum(Ca_i * x_i) - ratio * sum(P_i * x_i) ≥ 0` fica `0 ≥ 0`, trivialmente satisfeita. Nenhum warning é emitido.

**Avaliação:**
- `bug_real: nao` — Todos ingredientes atuais têm Ca e P não-nulos. A condição de bypass não ocorre com dados reais.
- `mvp_aceitavel: sim` — Dataset tem cobertura de Ca/P.
- `pre_opensource: medium` — Se alguém adicionar ingrediente sem Ca/P ou selecionar subconjunto pobre, a razão Ca:P some sem aviso. Adicionar warning.

**Recomendação:** Adicionar coverage check para Ca/P antes de abrir. Correlato ao CoverageGate.

---

### F7. `formulate()` sem testes

**Localização:** `src/engine/index.ts:34-66`

**Avaliação:**
- `bug_real: nao` — Ausência de teste não é bug. O pipeline funciona (testado indiretamente pelos testes de solver + targets + biometry).
- `mvp_aceitavel: sim` — Cobertura de unidade existe para os blocos internos.
- `pre_opensource: critical` — Qualquer refatoração (inevitável) sem teste de integração do pipeline principal quebra sem detecção. É o fio mais importante do app.

**Recomendação:** Escrever teste de integração `formulate()` com DogProfile real antes de abrir.

---

### F8. `loaders.ts:27-35` — Working dog < 18 meses

**Localização:** `src/data/loaders.ts:27-35`

**Comportamento:** Se `isWorking = true` e `ageMonths < 18`, o cão recebe estágio etário (puppy), NÃO working_adult.

**Avaliação:**
- `bug_real: nao` — O usuário tem um Pastor Alemão (companhia, guarda), não um cão de trabalho/performance. `isWorking` será `false`. Nunca vai entrar nessa branch.
- `mvp_aceitavel: sim` — Branch irrelevante para o caso de uso.
- `pre_opensource: medium` — Decisão de design não documentada. Se abrir o código, alguém pode questionar. Documentar a intenção.

**Recomendação:** Documentar decisão. Não alterar lógica.

---

### F9. `solver.ts:114` — DER = 0, restrição calórica removida

**Localização:** `src/engine/solver.ts:114`

**Avaliação:**
- `bug_real: nao` — `computeBiometry` sempre retorna `der_kcal > 0` para peso > 0. O Pastor Alemão terá peso > 0.
- `mvp_aceitavel: sim` — Nunca ocorre.
- `pre_opensource: low` — Se alguém criar perfil com peso 0, DER = 0. Guard no Zod (`weight_kg: z.number().positive()`) já existe no schema.

**Recomendação:** Já está protegido pelo Zod no frontend. Nada a fazer.

---

### F10. `ResultsPanel.tsx:35-43` — handleExport sem try-catch

**Localização:** `src/components/ResultsPanel.tsx:35-43`

**Avaliação:**
- `bug_real: nao` — IndexedDB é estável no browser. Falha de storage é raríssima.
- `mvp_aceitavel: sim` — Risco baixo, impacto baixo (usuário perde export, não dados).
- `pre_opensource: low` — Seria elegante tratar, mas não crítico.

**Recomendação:** Adicionar try-catch + feedback visual se desejar, mas não bloqueante.

---

### F11. `Per100gSchema` — z.record(z.string(), z.number()) aceita qualquer chave

**Localização:** `src/types/index.ts:29`

**Avaliação:**
- `bug_real: latente` — Se o gerador de JSON produzir `calcIum_mg` em vez de `calcium_mg`, o campo é ignorado silenciosamente (retorna 0 em `getNutrientPerGram`). Com o gerador atual, isso não ocorre.
- `mvp_aceitavel: sim` — Dado é gerado, não escrito.
- `pre_opensource: medium` — Se alguém gerar dados manualmente, typos em field keys viram 0 sem warning. Uma validação contra `NUTRIENT_REGISTRY` pegaria isso.

**Recomendação:** Adicionar validação pós-parse que verifica se todas `raw_field_key` existem nos ingredientes. Não urgente.

---

### F12. `solver_status` — `'feasible'` e `'error'` são dead code

**Localização:** `src/types/index.ts:248`, `src/engine/solver.ts:217`

**Avaliação:**
- `bug_real: nao` — Dead code não é bug, apenas ruído.
- `mvp_aceitavel: sim` — Totalmente inofensivo.
- `pre_opensource: low` — Limpeza estética. O enum mais restrito (`'optimal' | 'infeasible'`) seria mais honesto.

**Recomendação:** Se quiser, reduzir enum. Não impacta funcionalidade.

---

### F13. `getStageForProfile` — múltiplos match, primeiro vence

**Localização:** `src/data/loaders.ts:31-35`

**Avaliação:**
- `bug_real: nao` — Ordem do JSON é estável. Não há sobreposição de faixas etárias nos dados gerados.
- `mvp_aceitavel: sim` — Não ambíguo com dados atuais.
- `pre_opensource: medium` — Se alguém adicionar estágios com faixas sobrepostas, comportamento é frágil. Documentar que primeiro match vence.

**Recomendação:** Documentar. Não alterar agora.

---

### F14. `puppyMultiplier` usa boundaries hardcoded para large breed

**Localização:** `src/engine/biometry.ts:39-43`

**Contexto:** O usuário vai ter um Pastor Alemão (large breed). As boundaries 3.5, 4, 6, 12, 18 meses são da literatura para raças grandes.

**Avaliação:**
- `bug_real: nao` — As boundaries são apropriadas para large breed. O usuário tem large breed.
- `mvp_aceitavel: sim` — Correto para o caso de uso.
- `pre_opensource: medium` — Pequenas raças têm boundaries diferentes (6-8 semanas, 3-4 meses, 6-8 meses). Antes de abrir, decidir se o app suporta múltiplos portes.

**Recomendação:** Documentar que as boundaries são para large breed. Deixar como está.

---

### F15. `bcsTargetWeightKg` — modelo linear 10%/ponto BCS

**Localização:** `src/engine/biometry.ts:47-49`

**Avaliação:**
- `bug_real: nao` — É uma aproximação clínica padrão para MVP. Nenhuma fórmula é perfeita.
- `mvp_aceitavel: sim` — Aceitável para MVP. O usuário pode ajustar manualmente se necessário.
- `pre_opensource: medium` — Documentar que é aproximação. Pode-se adicionar fatores de correção por raça depois.

**Recomendação:** Documentar como aproximação. Não mudar agora.

---

### F16. `getNutrientPerGram` — EPA+DHA raw_field_key enganoso

**Localização:** `src/data/nutrientRegistry.ts:80`, `src/engine/targets.ts:171-181`

**Comportamento:** `epa_dha` registra `raw_field_key: 'omega_3_epa_g'`, mas `getNutrientPerGram` NÃO usa esse campo — tem lógica especial que tenta `omega_3_epa_dha_g` primeiro, depois soma `omega_3_epa_g + omega_3_dha_g`.

**Avaliação:**
- `bug_real: nao` — A função se comporta corretamente. O `raw_field_key` no registry é apenas documentação (não usado para epa_dha).
- `mvp_aceitavel: sim` — Funciona. A inconsistência é apenas documental.
- `pre_opensource: low` — Limpeza de documentação. Mudar o `raw_field_key` para `null` ou adicionar comentário.

**Recomendação:** Corrigir o comentário/documentação, não a lógica.

---

### F17. Vitamin D com cobertura de apenas 3 ingredientes

**Localização:** Dados (ingredients.json)

**Comportamento:** `vitamin_d_iu` existe em apenas 3 dos 26 ingredientes (sardinha, ovos de galinha, alguns órgãos).

**Avaliação:**
- `bug_real: latente` — Se o usuário não selecionar ingredientes ricos em Vit D, a restrição é removida pelo CoverageGate (warning gerado). A formulação pode não ter Vit D suficiente.
- `mvp_aceitavel: parcial` — O CoverageGatedetecta e avisa. Mas o aviso é genérico e pode passar despercebido. Para MVP solo, o usuário pode manualmente incluir sardinha ou óleo de fígado de bacalhau.
- `pre_opensource: high` — Base de dados incompleta para Vit D. Antes de abrir, expandir dados ou documentar limitação.

**Recomendação:** Coletar mais dados de Vit D ou pelo menos documentar que a base cobre apenas 3 ingredientes. Também considerar suplementação.

---

### F18. `coverage_excluded_nutrients` adicionado ao Formulation mas solver ainda gera msg duplicada

**Localização:** `src/engine/solver.ts:315-320` (msg em reconciliation_warnings) + `src/engine/solver.ts:353` (campo novo)

**Comportamento:** O solver pusha a mensagem de coverage em `reconciliation_warnings` E também popula `coverage_excluded_nutrients`. O CoverageBanner usa o campo novo, mas a mensagem antiga ainda aparece na tab "Avisos".

**Avaliação:**
- `bug_real: parcial` — Duplicidade de informação. A tab Avisos mostra a mensagem de coverage, e o CoverageBanner também mostra. Usuário vê duas vezes.
- `mvp_aceitavel: parcial` — Informação duplicada não é erro, é ruído. O usuário ainda entende.
- `pre_opensource: low` — Remover a string de coverage de `reconciliation_warnings` já que o campo dedicado existe.

**Recomendação:** Remover a mensagem genérica de `reconciliation_warnings` e deixar só o campo dedicado. Não urgente.

---

### F19. Testes de gestação/lactação ausentes

**Localização:** `src/engine/biometry.ts:63-81`

**Avaliação:**
- `bug_real: nao` — O usuário tem um cão macho? Não especificado, mas Pastor Alemão pode ser fêmea. Mesmo assim, gestação/lactação são fases futuras.
- `mvp_aceitavel: sim` — Não testado mas não usado.
- `pre_opensource: medium` — Antes de abrir, testar. Especialmente os multiplicadores gestação/lactação que têm impacto clínico real.

**Recomendação:** Adicionar testes antes de open-source. Não prioritário agora.

---

### F20. `rawStageToRequirementStage` — mapeamento Ca:P hardcoded

**Localização:** `src/engine/targets.ts:248-249`

**Avaliação:**
- `bug_real: nao` — Só existe Ca:P como ratio constraint. Funciona para o caso atual.
- `mvp_aceitavel: sim` — Futuras constraints de ratio (Zn:Cu, Ca:Zn) exigirão refatoração, mas não existem ainda.
- `pre_opensource: low` — Refatorar quando novas constraints forem adicionadas.

**Recomendação:** Não mexer. Refatorar quando houver mais de uma ratio constraint.

---

### F21. UI mostra "Todos nutrientes dentro dos limites" com lista vazia

**Localização:** `src/components/ResultsPanel.tsx:90-92`

**Comportamento:** Se `nutrient_results` estiver vazio (formulação sem nutrientes computados), `deficientCount = 0`, `excessCount = 0`, `warningCount = 0`, então mostra badge verde "Todos nutrientes dentro dos limites".

**Avaliação:**
- `bug_real: nao` — `nutrient_results` nunca está vazio. O solver sempre popula com todos nutrientes do registry (inclusive os não-target com status 'unchecked').
- `mvp_aceitavel: sim` — Caminho feliz sempre tem resultados.
- `pre_opensource: low` — Guard defensivo: `if (nutrient_results.length === 0)` mostrar "Nenhum resultado".

**Recomendação:** Adicionar guard contra array vazio. Não urgente.

---

### F22. `nutrientHasCoverage()` criada mas não usada pelo solver

**Localização:** `src/engine/targets.ts:260-268` vs `src/engine/solver.ts:128-143`

**Comportamento:** Existe função `nutrientHasCoverage()` em targets.ts, mas o solver faz o coverage check inline (loop sobre ingredientes).

**Avaliação:**
- `bug_real: nao` — Função auxiliar não usada não é bug.
- `mvp_aceitavel: sim` — Dead code não prejudica.
- `pre_opensource: low` — Decidir se usar a função no solver ou remover o helper.

**Recomendação:** Refatorar para usar a função compartilhada ou remover. Não urgente.

---

### F23. `getNutrientPerGram` — alias fallback só para pyridoxine

**Localização:** `src/engine/targets.ts:144-146`

**Avaliação:**
- `bug_real: nao` — Só existe um alias documentado. Funciona.
- `mvp_aceitavel: sim` — Se novos aliases forem descobertos, adicionar.
- `pre_opensource: low` — Manter como está.

**Recomendação:** Nada a fazer.

---

### F24. CoverageBanner importa NUTRIENT_REGISTRY diretamente (layering violation)

**Localização:** `src/components/ui/CoverageBanner.tsx:1`

**Avaliação:**
- `bug_real: nao` — Acoplamento direto com data layer. Para MVP solo, aceitável.
- `mvp_aceitavel: sim` — Pragmático.
- `pre_opensource: medium` — Idealmente, o componente receberia labels/units como props, não importaria do data layer.

**Recomendação:** Refatorar para receber dados como props antes de abrir. Não urgente.

---

## RESUMO POR PRIORIDADE

### Corrigir antes de abrir o código (pre_opensource: critical)

| # | Finding | Esforço estimado |
|---|---|---|
| F1 | `kcal_per_100g` sem `?? 0` | 5 min |
| F7 | Teste de integração para `formulate()` | 30 min |

### Corrigir antes de abrir (pre_opensource: high)

| # | Finding | Esforço estimado |
|---|---|---|
| F3 | Runtime validation nos dados carregados (Zod .parse) | 15 min |
| F17 | Expandir base de Vit D ou documentar limitação | 1-2h (coleta de dados) |

### Corrigir antes de abrir (pre_opensource: medium)

| # | Finding | Esforço estimado |
|---|---|---|
| F2 | Try-catch no solver.Solve() | 5 min |
| F5 | Decidir comportamento de selectedIds vazio | Decisão, não código |
| F6 | Warning quando Ca/P sem cobertura | 10 min |
| F8 | Documentar decisão working + puppy | 2 min |
| F11 | Validar raw_field_keys contra ingredientes | 15 min |
| F13 | Documentar "primeiro match vence" em getStageForProfile | 2 min |
| F14 | Documentar boundaries large breed no puppyMultiplier | 2 min |
| F15 | Documentar aproximação linear BCS | 2 min |
| F19 | Testes de gestação/lactação | 20 min |
| F24 | Desacoplar CoverageBanner do data layer | 15 min |

### Baixa prioridade (pre_opensource: low/wontfix)

| # | Finding | Motivo |
|---|---|---|
| F4 | Guard array vazio | Raramente ocorre |
| F9 | DER=0 | Já protegido por Zod |
| F10 | Try-catch export | Impacto baixo |
| F12 | Dead code solver_status | Inofensivo |
| F16 | EPA+DHA raw_field_key enganoso | Cosmético |
| F18 | Duplicação coverage msg | Ruído, não erro |
| F20 | Ca:P hardcoded | Só existe um ratio |
| F21 | UI com lista vazia | Nunca ocorre |
| F22 | nutrientHasCoverage não usada | Dead code inofensivo |
| F23 | Alias só pyridoxine | Funciona |

---

## OBSERVAÇÕES ESPECÍFICAS PARA O CASO DE USO

### Pastor Alemão — Large Breed Puppy

- **`large_breed_puppy_early_growth` (0-3.5 meses)**: Correto para a raça.
- **`large_breed_puppy_late_growth` (3.5-18 meses)**: Correto. Pastores Alemães crescem até ~18 meses.
- **`adult_maintenance` (≥18 meses)**: Correto.
- **Multiplicadores DER**: 3.0x (0-4mo), 2.5x (4-6mo), 2.0x (6-12mo), 1.8x (12-18mo) — adequados para large breed.
- **BCS**: Como o usuário não tem o cão ainda, BCS será ideal (5). O ajuste `(bcs-5)*0.1` dá peso_target = peso_atual.

### Risco real para o usuário

1. **Base de Vit D incompleta** — Se o usuário formular sem sardinha ou óleo de fígado de bacalhau, a restrição de Vit D cai (CoverageGate avisa). O usuário precisa ativamente incluir esses ingredientes.
2. **Nenhum** dos "bugs críticos" da análise sistêmica afeta o usuário com os dados atuais.
3. **A formulação funciona** — 19 testes passam, `tsc --noEmit` limpo, o pipeline biometry→targets→solver→UI está íntegro.

---

## FLUXO DE DECISÃO PARA LLM FUTURO

```
Ao receber este snapshot + pedido de modificação:

1. Identificar se o pedido toca em algum finding acima
2. Verificar `pre_opensource`: se "critical" ou "high", priorizar
3. Verificar `mvp_aceitavel`: se "sim", questionar se realmente precisa agora
4. Verificar `bug_real`: se "nao", confirmar se contexto mudou

Exceção: se o usuário explicitamente pedir open-source readiness,
ignorar mvp_aceitavel e seguir pre_opensource.
```

---

## CHECKLIST PRÉ-OPEN-SOURCE (ações concretas)

- [ ] F1: Adicionar `?? 0` em `solver.ts:229` + warn
- [ ] F7: Escrever `formulate()` integration test
- [ ] F3: Adicionar Zod.parse nos loaders
- [ ] F17: Expandir dados de Vit D OU adicionar warning no CoverageBanner específico
- [ ] F2: Try-catch no solver.Solve()
- [ ] F5: Decidir comportamento selectedIds
- [ ] F6: Warning Ca/P sem cobertura
- [ ] F8, F13, F14, F15: Documentar decisões
- [ ] F19: Testes gestação/lactação
- [ ] F24: Desacoplar CoverageBanner
- [ ] F11: Validar raw_field_keys
- [ ] F18: Remover duplicação coverage msg

Tempo estimado total: ~4-6 horas.
