/**
 * database.ts
 * Dexie (IndexedDB) schema for profiles, formulations, and audit log.
 */

import Dexie, { type Table } from 'dexie'
import type { DogProfile, Formulation } from '../types'

export interface AuditEntry {
  id?: number          // auto-increment
  timestamp: string
  entity_type: 'profile' | 'formulation'
  entity_id: string
  action: 'create' | 'update' | 'delete'
  snapshot: string     // JSON snapshot before change
}

export class GsdDietDatabase extends Dexie {
  profiles!: Table<DogProfile, string>
  formulations!: Table<Formulation, string>
  audit!: Table<AuditEntry, number>

  constructor() {
    super('GsdDietDatabase')
    this.version(1).stores({
      profiles:     'id, name, life_stage, updated_at',
      formulations: 'id, dog_profile_id, stage_id, created_at',
      audit:        '++id, entity_type, entity_id, timestamp',
    })
  }
}

export const db = new GsdDietDatabase()

// ── CRUD helpers ─────────────────────────────────────────────────────────────

function now() { return new Date().toISOString() }

async function auditLog(
  entity_type: AuditEntry['entity_type'],
  entity_id: string,
  action: AuditEntry['action'],
  snapshot: unknown,
) {
  await db.audit.add({
    timestamp: now(),
    entity_type,
    entity_id,
    action,
    snapshot: JSON.stringify(snapshot),
  })
}

// Profiles

export async function saveProfile(profile: DogProfile): Promise<void> {
  const existing = await db.profiles.get(profile.id)
  const enriched = { ...profile, updated_at: now(), created_at: profile.created_at ?? now() }
  if (existing) {
    await auditLog('profile', profile.id, 'update', existing)
  } else {
    await auditLog('profile', profile.id, 'create', null)
  }
  await db.profiles.put(enriched)
}

export async function deleteProfile(id: string): Promise<void> {
  const existing = await db.profiles.get(id)
  if (existing) await auditLog('profile', id, 'delete', existing)
  await db.profiles.delete(id)
  // cascade-delete formulations for this profile
  await db.formulations.where('dog_profile_id').equals(id).delete()
}

export async function listProfiles(): Promise<DogProfile[]> {
  return db.profiles.orderBy('name').toArray()
}

export async function getProfile(id: string): Promise<DogProfile | undefined> {
  return db.profiles.get(id)
}

// Formulations

export async function saveFormulation(formulation: Formulation): Promise<void> {
  const existing = await db.formulations.get(formulation.id)
  if (existing) {
    await auditLog('formulation', formulation.id, 'update', existing)
  } else {
    await auditLog('formulation', formulation.id, 'create', null)
  }
  await db.formulations.put(formulation)
}

export async function listFormulationsForProfile(profileId: string): Promise<Formulation[]> {
  return db.formulations
    .where('dog_profile_id')
    .equals(profileId)
    .reverse()
    .sortBy('created_at')
}

export async function getFormulation(id: string): Promise<Formulation | undefined> {
  return db.formulations.get(id)
}

export async function deleteFormulation(id: string): Promise<void> {
  const existing = await db.formulations.get(id)
  if (existing) await auditLog('formulation', id, 'delete', existing)
  await db.formulations.delete(id)
}

// Export / Import

export async function exportAll(): Promise<string> {
  const [profiles, formulations, auditEntries] = await Promise.all([
    db.profiles.toArray(),
    db.formulations.toArray(),
    db.audit.toArray(),
  ])
  return JSON.stringify({ profiles, formulations, audit: auditEntries, exported_at: now() }, null, 2)
}

export async function importAll(json: string): Promise<{ profiles: number; formulations: number }> {
  const data = JSON.parse(json)
  let pCount = 0, fCount = 0
  if (Array.isArray(data.profiles)) {
    await db.profiles.bulkPut(data.profiles)
    pCount = data.profiles.length
  }
  if (Array.isArray(data.formulations)) {
    await db.formulations.bulkPut(data.formulations)
    fCount = data.formulations.length
  }
  return { profiles: pCount, formulations: fCount }
}
