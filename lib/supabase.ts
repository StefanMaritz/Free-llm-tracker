/**
 * Supabase admin client. SERVER ONLY.
 *
 * This uses your secret key, which bypasses every security rule in the
 * database. That is fine here because it only ever runs inside API routes on
 * the server - it is never sent to the browser.
 *
 * Rule to remember: NEXT_PUBLIC_ anything is public and ends up in the
 * browser. The secret key deliberately has no NEXT_PUBLIC_ prefix. Never add
 * one to it.
 *
 * Supabase renamed these keys. New projects give you `sb_secret_...`; older
 * ones call it the `service_role` key. Both work, so we accept either name.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local (see .env.example).'
    )
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
