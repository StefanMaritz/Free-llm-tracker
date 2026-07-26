/**
 * Email, via Resend.
 *
 * Plain fetch against the Resend REST API rather than their SDK - it is one
 * call and this project stays dependency-light on purpose.
 *
 * Email is entirely optional. With no RESEND_API_KEY set, sending is skipped
 * and the app carries on exactly as before, so nobody is forced into a fourth
 * account just to run a tracker.
 */
import type { AuditAggregate } from './tracker/types'

const RESEND_URL = 'https://api.resend.com/emails'

/**
 * Resend will only deliver to arbitrary addresses once you have verified a
 * domain. Until then their shared sender works, but only to the address that
 * owns the Resend account - which is fine, because the person setting this up
 * is usually mailing themselves.
 */
const FROM = process.env.EMAIL_FROM ?? 'LLM Tracker <onboarding@resend.dev>'

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) return // email is opt-in; silently skip

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    throw new Error(`Resend returned ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  }
}

const pct = (n: number) => `${Math.round(n * 100)}%`

function metric(label: string, value: string): string {
  return `
    <td style="padding:0 24px 0 0;">
      <div style="font:500 11px/1.4 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#767b84;">${label}</div>
      <div style="font:600 28px/1.2 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0b0c0e;">${value}</div>
    </td>`
}

/** The report is ready. Headline numbers, top rivals, link to the full thing. */
export async function sendReportEmail(
  to: string,
  data: { brand: string; aggregate: AuditAggregate; reportUrl: string }
): Promise<void> {
  const { brand, aggregate: a, reportUrl } = data

  const rivals = a.brandStandings
    .filter((b) => !b.isBrand)
    .slice(0, 5)
    .map(
      (b, i) =>
        `<tr><td style="padding:6px 0;color:#767b84;width:24px;">${i + 1}</td>
         <td style="padding:6px 0;color:#0b0c0e;">${escapeHtml(b.name)}</td>
         <td style="padding:6px 0;text-align:right;color:#0b0c0e;">${pct(b.share)}</td></tr>`
    )
    .join('')

  const byType = a.perType
    .map(
      (t) =>
        `<tr><td style="padding:6px 0;color:#0b0c0e;text-transform:capitalize;">${t.type}</td>
         <td style="padding:6px 0;text-align:right;color:#0b0c0e;">${pct(t.mentionRate)}</td></tr>`
    )
    .join('')

  const html = `
<div style="background:#fff;padding:32px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0b0c0e;max-width:600px;">
  <div style="font:500 11px/1.4 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:#767b84;">LLM Tracker report</div>
  <h1 style="font-size:28px;font-weight:700;letter-spacing:-.02em;margin:8px 0 4px;">${escapeHtml(brand)}</h1>
  <p style="color:#767b84;font-size:14px;margin:0 0 28px;">
    ${a.answeredPrompts} of ${a.totalPrompts} prompts across five AI models.
  </p>

  <table style="border-collapse:collapse;margin-bottom:28px;"><tr>
    ${metric('Mention rate', pct(a.mentionRate))}
    ${metric('Share of voice', pct(a.shareOfVoice))}
    ${metric('Cited you', pct(a.citationRate))}
  </tr></table>

  ${
    byType
      ? `<div style="font:500 11px/1.4 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#767b84;margin-bottom:6px;">Mention rate by prompt type</div>
         <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;border-top:1px solid #e4e4e4;">${byType}</table>`
      : ''
  }

  ${
    rivals
      ? `<div style="font:500 11px/1.4 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#767b84;margin-bottom:6px;">Who else the models named</div>
         <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:28px;border-top:1px solid #e4e4e4;">${rivals}</table>`
      : ''
  }

  <a href="${reportUrl}" style="display:inline-block;background:#0b0c0e;color:#fff;text-decoration:none;padding:12px 24px;font-size:14px;font-weight:500;">
    Read the full report
  </a>

  <p style="color:#767b84;font-size:12px;margin:28px 0 0;border-top:1px solid #e4e4e4;padding-top:16px;">
    Run cost $${a.totalCostUsd.toFixed(4)}. The report link keeps working, so you can compare it
    against next week's.
  </p>
</div>`

  await send(to, `${brand}: ${pct(a.mentionRate)} mention rate across AI models`, html)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
