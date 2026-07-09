/**
 * nutrientRegistry.ts — v6
 *
 * raw_field_key = chave EXATA em per_100g_as_fed do banco de dados.
 * unit_canonical = unidade canônica de saída do sistema.
 *
 * CORREÇÕES v6 (7 entradas corrigidas vs. v4/v5):
 *   iodine:     raw_field_key era 'iodine_mg'    → 'iodine_ug',    unit era 'mg' → 'ug'
 *   selenium:   raw_field_key era 'selenium_mg'  → 'selenium_ug',  unit era 'mg' → 'ug'
 *   chromium:   raw_field_key era 'chromium_mg'  → 'chromium_ug',  unit era 'mg' → 'ug'
 *   vitamin_k:  raw_field_key era 'vitamin_k_mg' → 'vitamin_k_ug', unit era 'mg' → 'ug'
 *   biotin:     raw_field_key era 'biotin_mg'    → 'biotin_ug',    unit era 'mg' → 'ug'
 *   folic_acid: raw_field_key era 'folic_acid_mg'→ 'folic_acid_ug',unit era 'mg' → 'ug'
 *   cobalamin:  raw_field_key era 'cobalamin_mg' → 'vitamin_b12_ug'(campo real no BD)
 *   epa_dha:    raw_field_key='omega_3_epa_g' (primary); getNutrientPerGram soma epa+dha
 *   pyridoxine: raw_field_key era 'vitamin_b6_mg' → 'pyridoxine_mg' (campo real no BD v0.3)
 */

export interface NutrientDefinition {
  id: string
  raw_field_key: string       // chave exata em per_100g_as_fed
  label_pt: string
  unit_canonical: 'g' | 'mg' | 'ug' | 'IU'
  clinical_criticality: 'critical' | 'important' | 'desirable'
  has_safety_ceiling: boolean
}

export const NUTRIENT_REGISTRY: Record<string, NutrientDefinition> = {
  // ── Macronutrientes ──────────────────────────────────────────────────────
  protein:    { id: 'protein',    raw_field_key: 'protein_g',    label_pt: 'Proteína',             unit_canonical: 'g',  clinical_criticality: 'critical',  has_safety_ceiling: false },
  fat:        { id: 'fat',        raw_field_key: 'fat_g',        label_pt: 'Gordura',               unit_canonical: 'g',  clinical_criticality: 'critical',  has_safety_ceiling: true  },

  // ── Macrominerais ────────────────────────────────────────────────────────
  calcium:    { id: 'calcium',    raw_field_key: 'calcium_mg',    label_pt: 'Cálcio',               unit_canonical: 'mg', clinical_criticality: 'critical',  has_safety_ceiling: true  },
  phosphorus: { id: 'phosphorus', raw_field_key: 'phosphorus_mg', label_pt: 'Fósforo',              unit_canonical: 'mg', clinical_criticality: 'critical',  has_safety_ceiling: false },
  sodium:     { id: 'sodium',     raw_field_key: 'sodium_mg',     label_pt: 'Sódio',                unit_canonical: 'mg', clinical_criticality: 'important', has_safety_ceiling: true  },
  potassium:  { id: 'potassium',  raw_field_key: 'potassium_mg',  label_pt: 'Potássio',             unit_canonical: 'mg', clinical_criticality: 'important', has_safety_ceiling: false },
  magnesium:  { id: 'magnesium',  raw_field_key: 'magnesium_mg',  label_pt: 'Magnésio',             unit_canonical: 'mg', clinical_criticality: 'important', has_safety_ceiling: false },

  // ── Minerais-traço ───────────────────────────────────────────────────────
  zinc:       { id: 'zinc',       raw_field_key: 'zinc_mg',       label_pt: 'Zinco',                unit_canonical: 'mg', clinical_criticality: 'critical',  has_safety_ceiling: true  },
  iron:       { id: 'iron',       raw_field_key: 'iron_mg',       label_pt: 'Ferro',                unit_canonical: 'mg', clinical_criticality: 'important', has_safety_ceiling: true  },
  copper:     { id: 'copper',     raw_field_key: 'copper_mg',     label_pt: 'Cobre',                unit_canonical: 'mg', clinical_criticality: 'important', has_safety_ceiling: true  },
  manganese:  { id: 'manganese',  raw_field_key: 'manganese_mg',  label_pt: 'Manganês',             unit_canonical: 'mg', clinical_criticality: 'desirable', has_safety_ceiling: false },
  iodine:     { id: 'iodine',     raw_field_key: 'iodine_ug',     label_pt: 'Iodo',                 unit_canonical: 'ug', clinical_criticality: 'critical',  has_safety_ceiling: true  },
  selenium:   { id: 'selenium',   raw_field_key: 'selenium_ug',   label_pt: 'Selênio',              unit_canonical: 'ug', clinical_criticality: 'important', has_safety_ceiling: true  },
  chromium:   { id: 'chromium',   raw_field_key: 'chromium_ug',   label_pt: 'Cromo',                unit_canonical: 'ug', clinical_criticality: 'desirable', has_safety_ceiling: true  },

  // ── Vitaminas lipossolúveis ──────────────────────────────────────────────
  vitamin_a:  { id: 'vitamin_a',  raw_field_key: 'vitamin_a_iu',  label_pt: 'Vitamina A',           unit_canonical: 'IU', clinical_criticality: 'important', has_safety_ceiling: true  },
  vitamin_d:  { id: 'vitamin_d',  raw_field_key: 'vitamin_d_iu',  label_pt: 'Vitamina D',           unit_canonical: 'IU', clinical_criticality: 'critical',  has_safety_ceiling: true  },
  vitamin_e:  { id: 'vitamin_e',  raw_field_key: 'vitamin_e_mg',  label_pt: 'Vitamina E',           unit_canonical: 'mg', clinical_criticality: 'important', has_safety_ceiling: false },
  vitamin_k:  { id: 'vitamin_k',  raw_field_key: 'vitamin_k_ug',  label_pt: 'Vitamina K',           unit_canonical: 'ug', clinical_criticality: 'desirable', has_safety_ceiling: false },

  // ── Vitaminas hidrossolúveis — Complexo B ────────────────────────────────
  thiamin:          { id: 'thiamin',          raw_field_key: 'thiamin_mg',          label_pt: 'Vitamina B1 (Tiamina)',          unit_canonical: 'mg', clinical_criticality: 'important', has_safety_ceiling: false },
  riboflavin:       { id: 'riboflavin',       raw_field_key: 'riboflavin_mg',       label_pt: 'Vitamina B2 (Riboflavina)',       unit_canonical: 'mg', clinical_criticality: 'important', has_safety_ceiling: false },
  niacin:           { id: 'niacin',           raw_field_key: 'niacin_mg',           label_pt: 'Vitamina B3 (Niacina)',           unit_canonical: 'mg', clinical_criticality: 'important', has_safety_ceiling: false },
  pantothenic_acid: { id: 'pantothenic_acid', raw_field_key: 'pantothenic_acid_mg', label_pt: 'Vitamina B5 (Ác. Pantotênico)',  unit_canonical: 'mg', clinical_criticality: 'desirable', has_safety_ceiling: false },
  pyridoxine:       { id: 'pyridoxine',       raw_field_key: 'pyridoxine_mg',       label_pt: 'Vitamina B6 (Piridoxina)',        unit_canonical: 'mg', clinical_criticality: 'important', has_safety_ceiling: false },
  biotin:           { id: 'biotin',           raw_field_key: 'biotin_ug',           label_pt: 'Vitamina B7 (Biotina)',           unit_canonical: 'ug', clinical_criticality: 'desirable', has_safety_ceiling: false },
  folic_acid:       { id: 'folic_acid',       raw_field_key: 'folic_acid_ug',       label_pt: 'Vitamina B9 (Ácido Fólico)',      unit_canonical: 'ug', clinical_criticality: 'important', has_safety_ceiling: false },
  cobalamin:        { id: 'cobalamin',        raw_field_key: 'vitamin_b12_ug',      label_pt: 'Vitamina B12 (Cobalamina)',       unit_canonical: 'ug', clinical_criticality: 'critical',  has_safety_ceiling: false },
  vitamin_c:        { id: 'vitamin_c',        raw_field_key: 'vitamin_c_mg',        label_pt: 'Vitamina C',                      unit_canonical: 'mg', clinical_criticality: 'desirable', has_safety_ceiling: false },

  // ── Aminoácidos essenciais ───────────────────────────────────────────────
  arginine:               { id: 'arginine',               raw_field_key: 'arginine_g',               label_pt: 'Arginina',              unit_canonical: 'g', clinical_criticality: 'important', has_safety_ceiling: false },
  histidine:              { id: 'histidine',               raw_field_key: 'histidine_g',              label_pt: 'Histidina',             unit_canonical: 'g', clinical_criticality: 'important', has_safety_ceiling: false },
  isoleucine:             { id: 'isoleucine',              raw_field_key: 'isoleucine_g',             label_pt: 'Isoleucina',            unit_canonical: 'g', clinical_criticality: 'important', has_safety_ceiling: false },
  leucine:                { id: 'leucine',                 raw_field_key: 'leucine_g',                label_pt: 'Leucina',               unit_canonical: 'g', clinical_criticality: 'important', has_safety_ceiling: false },
  lysine:                 { id: 'lysine',                  raw_field_key: 'lysine_g',                 label_pt: 'Lisina',                unit_canonical: 'g', clinical_criticality: 'important', has_safety_ceiling: true  },
  methionine_cystine:     { id: 'methionine_cystine',      raw_field_key: 'methionine_cystine_g',     label_pt: 'Metionina+Cistina',     unit_canonical: 'g', clinical_criticality: 'important', has_safety_ceiling: false },
  phenylalanine_tyrosine: { id: 'phenylalanine_tyrosine',  raw_field_key: 'phenylalanine_tyrosine_g', label_pt: 'Fenilalanina+Tirosina', unit_canonical: 'g', clinical_criticality: 'important', has_safety_ceiling: false },
  threonine:              { id: 'threonine',               raw_field_key: 'threonine_g',              label_pt: 'Treonina',              unit_canonical: 'g', clinical_criticality: 'important', has_safety_ceiling: false },
  tryptophan:             { id: 'tryptophan',              raw_field_key: 'tryptophan_g',             label_pt: 'Triptofano',            unit_canonical: 'g', clinical_criticality: 'important', has_safety_ceiling: false },
  valine:                 { id: 'valine',                  raw_field_key: 'valine_g',                 label_pt: 'Valina',                unit_canonical: 'g', clinical_criticality: 'important', has_safety_ceiling: false },

  // ── Ácidos graxos ────────────────────────────────────────────────────────
  // raw_field_key não é usado diretamente; getNutrientPerGram tenta omega_3_epa_dha_g primeiro,
  // depois soma omega_3_epa_g + omega_3_dha_g individualmente. Mantido apenas para consistência do schema.
  epa_dha: { id: 'epa_dha', raw_field_key: 'omega_3_epa_g', label_pt: 'EPA+DHA (Ômega-3 marinho)', unit_canonical: 'g', clinical_criticality: 'important', has_safety_ceiling: false },
}

export const NUTRIENT_IDS = Object.keys(NUTRIENT_REGISTRY)
