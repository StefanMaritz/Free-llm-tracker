/**
 * Where this app is running.
 *
 * Needed for the links inside emails, which have to be absolute. Vercel sets
 * VERCEL_PROJECT_PRODUCTION_URL for you, so on a normal deploy this just works.
 * Set APP_URL yourself if you use a custom domain.
 */
export function getAppUrl(): string {
  const explicit = process.env.APP_URL?.trim()
  if (explicit) return explicit.startsWith('http') ? explicit : `https://${explicit}`

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel}`

  return 'http://localhost:3000'
}
