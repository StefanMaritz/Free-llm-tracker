/**
 * Smoke test. Run this BEFORE you build anything else:
 *
 *   npm run smoke
 *
 * It makes one cheap call to the AI Gateway and one query to Supabase. If both
 * pass, your keys are right and the rest of the app will work. If you skip this
 * and something breaks later, you will not know which of the two is at fault.
 */

import { readFileSync, existsSync } from 'node:fs'

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions'

/**
 * Read .env.local ourselves rather than using node --env-file, which crashes
 * with an unreadable stack trace when the file does not exist yet - and "I have
 * not made .env.local yet" is the single most likely reason you are running
 * this script.
 */
function loadEnvLocal() {
  if (!existsSync('.env.local')) {
    console.log('\nThere is no .env.local file here yet.\n')
    console.log('  Create one by copying the example, then fill in your three keys:\n')
    console.log('    Windows:  Copy-Item .env.example .env.local')
    console.log('    Mac:      cp .env.example .env.local\n')
    console.log('Then run "npm run smoke" again.\n')
    process.exit(1)
  }

  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key && value && !process.env[key]) process.env[key] = value
  }
}

loadEnvLocal()

let failed = false

function ok(msg) {
  console.log(`  PASS  ${msg}`)
}
function bad(msg, detail) {
  failed = true
  console.log(`  FAIL  ${msg}`)
  if (detail) console.log(`        ${detail}`)
}

console.log('\nChecking your setup...\n')

// --- 1. env vars ------------------------------------------------------------
const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

for (const name of ['AI_GATEWAY_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL']) {
  if (process.env[name]) ok(`${name} is set`)
  else bad(`${name} is missing`, 'Add it to .env.local. See .env.example.')
}
if (SECRET) ok('SUPABASE_SECRET_KEY is set')
else bad('SUPABASE_SECRET_KEY is missing', 'Add it to .env.local. See .env.example.')

if (failed) {
  console.log('\nFix the missing keys first, then run again.\n')
  process.exit(1)
}

// --- 2. AI Gateway ----------------------------------------------------------
try {
  const res = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.TRACKER_MODEL_JUDGE ?? 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'Reply with the single word: working' }],
      // Keep this comfortably above 16 - the gateway rejects smaller ceilings
      // outright, which would fail this check even with a perfectly good key.
      max_tokens: 64,
    }),
  })

  if (!res.ok) {
    bad(`AI Gateway returned ${res.status}`, (await res.text()).slice(0, 200))
  } else {
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content ?? ''
    const cost = data.usage?.cost
    ok(`AI Gateway replied: "${text.trim()}"`)
    if (typeof cost === 'number') ok(`Cost reporting works ($${cost.toFixed(6)} for that call)`)
  }
} catch (err) {
  bad('Could not reach the AI Gateway', err.message)
}

// --- 3. Supabase ------------------------------------------------------------
try {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/rest/v1/audits?select=id&limit=1`
  const res = await fetch(url, {
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
  })
  const bodyText = await res.text()

  if (res.status === 404 || bodyText.includes('42P01')) {
    bad(
      'Supabase is reachable but the "audits" table does not exist',
      'Open the Supabase SQL editor and run supabase/schema.sql.'
    )
  } else if (bodyText.includes('42501')) {
    bad(
      'Supabase says permission denied on the audits table',
      'Re-run the GRANT lines at the bottom of supabase/schema.sql.'
    )
  } else if (res.status === 401) {
    bad('Supabase rejected your key', 'Check you copied the SECRET key, not the publishable one.')
  } else if (!res.ok) {
    bad(`Supabase returned ${res.status}`, bodyText.slice(0, 200))
  } else {
    ok('Supabase is reachable, the audits table exists, and the key can read it')
  }
} catch (err) {
  bad('Could not reach Supabase', err.message)
}

console.log(
  failed
    ? '\nSomething is not right. Fix the FAIL lines above, then run "npm run smoke" again.\n'
    : '\nEverything works. Run "npm run dev" and open http://localhost:3000\n'
)

// Set the code and let Node exit on its own. Calling process.exit() here races
// the still-closing fetch handles and crashes with a libuv assertion on Windows,
// which looks alarming and has nothing to do with your setup.
process.exitCode = failed ? 1 : 0
