import { parseMdFile } from './parseMdBlocks'
import ingredients from '../src/data/generated/ingredients.json' assert { type: 'json' }
import stages from '../src/data/generated/stages.json' assert { type: 'json' }

const banco = parseMdFile('C:/Users/Straube/Downloads/hahhahaha/Banco_de_Dados_Beta v0.3 - Dados Completos.md')
const comp = parseMdFile('C:/Users/Straube/Downloads/hahhahaha/COmplementar de estrategia v2.md')

const reconcileIds = new Set(ingredients.map(i => (i as any).id))
const bancoIds = new Set(banco.ingredients.map(i => i.id))
const compIds = new Set(comp.ingredients.map(i => i.id))
const allSource = new Set([...bancoIds, ...compIds])

const missing = [...allSource].filter(id => !reconcileIds.has(id))
const extra = [...reconcileIds].filter(id => !allSource.has(id))

const recStageIds = new Set(stages.map(s => (s as any).stage_id))
const compStageIds = new Set(comp.stages.map(s => s.stage_id))
const missingStages = [...compStageIds].filter(id => !recStageIds.has(id))

console.log('ingredients reconcile:', ingredients.length)
console.log('ingredients banco:', banco.ingredients.length)
console.log('ingredients comp:', comp.ingredients.length)
console.log('no reconcile mas nas fontes:', missing.length ? missing : 'nenhum')
console.log('no reconcile mas fora das fontes:', extra.length ? extra : 'nenhum')
console.log('stages reconcile:', stages.length)
console.log('stages comp:', comp.stages.length)
console.log('stages comp faltando no reconcile:', missingStages.length ? missingStages : 'nenhum')
