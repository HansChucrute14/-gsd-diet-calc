import { useState, useEffect, useCallback } from 'react'
import { listProfiles, saveProfile, deleteProfile } from '../db/database'
import type { DogProfile } from '../types'

export function useProfiles() {
  const [profiles, setProfiles] = useState<DogProfile[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setProfiles(await listProfiles())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const save = useCallback(async (p: DogProfile) => {
    await saveProfile(p)
    await refresh()
  }, [refresh])

  const remove = useCallback(async (id: string) => {
    await deleteProfile(id)
    await refresh()
  }, [refresh])

  return { profiles, loading, save, remove, refresh }
}
