import { createClient } from '@supabase/supabase-js'
import { isSupabaseDataSource } from '../data/dataSource'

export { isSupabaseDataSource } from '../data/dataSource'

function requiredSupabaseEnv(key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY') {
  const value = import.meta.env[key]

  if (!value) {
    throw new Error(`${key} is required when VITE_DATA_SOURCE=supabase`)
  }

  return value
}

const supabaseUrl = isSupabaseDataSource() ? requiredSupabaseEnv('VITE_SUPABASE_URL') : 'http://localhost'
const supabaseAnonKey = isSupabaseDataSource() ? requiredSupabaseEnv('VITE_SUPABASE_ANON_KEY') : 'local-mode'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

function assertSupabaseDataSource() {
  if (!isSupabaseDataSource()) {
    throw new Error('Supabase methods are unavailable outside Web Supabase mode')
  }
}

export async function getSupabaseSession() {
  assertSupabaseDataSource()
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw new Error(`Supabase session check failed: ${error.message}`)
  }

  return data.session
}

export async function signInToSupabase(email: string, password: string) {
  assertSupabaseDataSource()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    throw new Error(`Supabase login failed: ${error.message}`)
  }

  return data.session
}

export async function signOutFromSupabase() {
  assertSupabaseDataSource()
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(`Supabase logout failed: ${error.message}`)
  }
}
