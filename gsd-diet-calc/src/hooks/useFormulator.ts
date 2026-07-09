import { useState, useCallback } from 'react'
import { formulate } from '../engine'
import { saveFormulation } from '../db/database'
import { INGREDIENTS } from '../data/loaders'
import type { DogProfile, Formulation, FormulationMode, IngredientDisplayData } from '../types'

export interface FormulatorState {
  formulation: Formulation | null
  loading: boolean
  error: string | null
  der_kcal: number | null
  rer_kcal: number | null
  stage_id: string | null
}

export function useFormulator() {
  const [state, setState] = useState<FormulatorState>({
    formulation: null, loading: false, error: null,
    der_kcal: null, rer_kcal: null, stage_id: null,
  })

  const run = useCallback(async (
    profile: DogProfile,
    selectedIds: string[],
    minGrams?: number,
    maxGrams?: number,
    mode?: FormulationMode,
  ) => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const selectedIngredients: IngredientDisplayData[] = selectedIds.length > 0
        ? INGREDIENTS.filter(i => selectedIds.includes(i.id))
        : INGREDIENTS  // default: all ingredients

      const result = formulate({
        profile,
        ingredients: selectedIngredients,
        minGramsPerDay: minGrams,
        maxGramsPerDay: maxGrams,
        mode,
      })

      await saveFormulation(result.formulation)

      setState({
        formulation: result.formulation,
        loading: false,
        error: null,
        der_kcal: result.der_kcal,
        rer_kcal: result.rer_kcal,
        stage_id: result.stage_id,
      })
    } catch (err) {
      setState(s => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Erro desconhecido no solver.',
      }))
    }
  }, [])

  const reset = useCallback(() => {
    setState({ formulation: null, loading: false, error: null, der_kcal: null, rer_kcal: null, stage_id: null })
  }, [])

  return { ...state, run, reset }
}
