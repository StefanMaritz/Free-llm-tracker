/**
 * The report. A server component - no client JavaScript at all. The expandable
 * prompt rows use the browser's own <details> element.
 */
import type { AuditAggregate, AuditPromptResult, PromptType, Sentiment } from '@/lib/tracker/types'

const pct = (n: number) => `${Math.round(n * 100)}%`

const TYPE_LABEL: Record<PromptType, string> = {
  brand: 'Brand',
  category: 'Category',
  comparison: 'Comparison',
}

const TYPE_MEANING: Record<PromptType, string> = {
  brand: 'Questions about you by name. Low here means the models do not know you exist.',
  category: 'Buying questions where nobody named you. This is the one that grows pipeline.',
  comparison: 'You against a named rival. Low here means you lose the head-to-head.',
}

const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  not_mentioned: 'Not mentioned',
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-paper p-5">
      <p className="label mb-2">{label}</p>
      <p className="mb-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-xs leading-relaxed text-muted">{hint}</p>
    </div>
  )
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full bg-line">
      <div className="h-1 bg-ink" style={{ width: `${Math.max(1, Math.round(value * 100))}%` }} />
    </div>
  )
}

export interface HistoryPoint {
  id: string
  createdAt: string
  mentionRate: number
  shareOfVoice: number
}

export default function ReportView({
  brand,
  website,
  createdAt,
  aggregate,
  prompts,
  history = [],
  currentId,
}: {
  brand: string
  website: string | null
  createdAt: string
  aggregate: AuditAggregate
  prompts: AuditPromptResult[]
  history?: HistoryPoint[]
  currentId?: string
}) {
  const totalAnswers = aggregate.perEngine.reduce((s, e) => s + e.answered, 0)

  return (
    <div>
      {/* --- header --- */}
      <div className="mb-10">
        <p className="label mb-2">Report</p>
        <h1 className="text-3xl font-semibold tracking-tight">{brand}</h1>
        <p className="mt-2 text-sm text-muted">
          {website ?? 'no website'} &middot; {aggregate.answeredPrompts} of {aggregate.totalPrompts}{' '}
          prompts &middot; {totalAnswers} answers read &middot;{' '}
          {new Date(createdAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* --- headline numbers --- */}
      <div className="mb-14 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Mention rate"
          value={pct(aggregate.mentionRate)}
          hint={`You were named in ${pct(aggregate.mentionRate)} of all answers.`}
        />
        <Stat
          label="Share of voice"
          value={pct(aggregate.shareOfVoice)}
          hint="Your mentions as a share of every brand mentioned."
        />
        <Stat
          label="Citation rate"
          value={pct(aggregate.citationRate)}
          hint="Answers that linked to your own site as a source."
        />
        <Stat
          label="Average position"
          value={aggregate.averagePosition ? `#${aggregate.averagePosition}` : '-'}
          hint="Where you rank against other brands when you do appear."
        />
      </div>

      {/* --- the trend, once there is more than one run to compare --- */}
      {history.length > 1 && (
        <section className="mb-14">
          <h2 className="mb-1 text-xl font-semibold tracking-tight">Movement over time</h2>
          <p className="mb-6 text-sm text-muted">
            The same prompts, asked again each week. One run tells you where you stand; this is the
            only part that tells you whether anything you did worked.
          </p>
          <div className="divide-y divide-line border-y border-line">
            {history.map((h, i) => {
              const prev = i > 0 ? history[i - 1] : null
              const delta = prev ? h.mentionRate - prev.mentionRate : null
              const isCurrent = h.id === currentId
              return (
                <div key={h.id} className="flex items-center gap-4 py-3 text-sm">
                  <span className="w-28 shrink-0 tabular-nums">
                    {new Date(h.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                  <span className="flex-1">
                    <Bar value={h.mentionRate} />
                  </span>
                  <span className="w-14 shrink-0 text-right tabular-nums">{pct(h.mentionRate)}</span>
                  <span className="w-16 shrink-0 text-right tabular-nums text-muted">
                    {delta === null
                      ? '-'
                      : `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}pt`}
                  </span>
                  <span className="w-16 shrink-0 text-right">
                    {isCurrent ? (
                      <span className="label">this one</span>
                    ) : (
                      <a href={`/a/${h.id}`} className="label underline">
                        open
                      </a>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* --- by prompt type: the most useful table in the report --- */}
      <section className="mb-14">
        <h2 className="mb-1 text-xl font-semibold tracking-tight">Where you are winning and losing</h2>
        <p className="mb-6 text-sm text-muted">
          The three prompt types answer three different questions. Read them separately - a strong
          brand score with a weak category score is the most common (and most expensive) pattern.
        </p>
        <div className="divide-y divide-line border-y border-line">
          {aggregate.perType.map((t) => (
            <div key={t.type} className="grid gap-4 py-5 sm:grid-cols-[10rem_1fr_5rem]">
              <div>
                <p className="font-medium">{TYPE_LABEL[t.type]}</p>
                <p className="label mt-1">{t.prompts} prompts</p>
              </div>
              <div className="self-center">
                <Bar value={t.mentionRate} />
                <p className="mt-2 text-xs text-muted">{TYPE_MEANING[t.type]}</p>
              </div>
              <p className="self-center text-right text-2xl font-semibold tabular-nums">
                {pct(t.mentionRate)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* --- by engine --- */}
      <section className="mb-14">
        <h2 className="mb-1 text-xl font-semibold tracking-tight">By engine</h2>
        <p className="mb-6 text-sm text-muted">
          Every model was trained differently and searches differently. Being invisible on one is
          normal. Being invisible on all of them is a problem.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="label py-2 font-normal">Engine</th>
              <th className="label py-2 text-right font-normal">Answers</th>
              <th className="label py-2 text-right font-normal">Mention</th>
              <th className="label py-2 text-right font-normal">Share</th>
              <th className="label py-2 text-right font-normal">Cited you</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {aggregate.perEngine.map((e) => (
              <tr key={e.id}>
                <td className="py-3 font-medium">{e.label}</td>
                <td className="py-3 text-right tabular-nums">{e.answered}</td>
                <td className="py-3 text-right tabular-nums">{pct(e.mentionRate)}</td>
                <td className="py-3 text-right tabular-nums">{pct(e.shareOfVoice)}</td>
                <td className="py-3 text-right tabular-nums">{pct(e.citationRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* --- leaderboard --- */}
      <section className="mb-14">
        <h2 className="mb-1 text-xl font-semibold tracking-tight">Who owns the conversation</h2>
        <p className="mb-6 text-sm text-muted">
          Every brand the models named, ranked. If a competitor is above you here, they are the
          default answer in your category.
        </p>
        <div className="divide-y divide-line border-y border-line">
          {aggregate.brandStandings.slice(0, 15).map((b, i) => (
            <div key={b.name} className="flex items-center gap-4 py-3">
              <span className="label w-6 shrink-0">{i + 1}</span>
              <span className={`w-56 shrink-0 truncate ${b.isBrand ? 'font-semibold' : ''}`}>
                {b.name}
                {b.isBrand && <span className="label ml-2">you</span>}
              </span>
              <span className="flex-1">
                <Bar value={b.share} />
              </span>
              <span className="w-14 shrink-0 text-right text-sm tabular-nums">{pct(b.share)}</span>
              <span className="label w-20 shrink-0 text-right">{b.mentions} mentions</span>
            </div>
          ))}
        </div>
      </section>

      {/* --- sources --- */}
      {aggregate.citedUrls.length > 0 && (
        <section className="mb-14">
          <h2 className="mb-1 text-xl font-semibold tracking-tight">Where the answers came from</h2>
          <p className="mb-6 text-sm text-muted">
            The sources the models linked to. These pages are what shape the answer, so these are
            the pages worth influencing.
          </p>
          <ul className="divide-y divide-line border-y border-line">
            {aggregate.citedUrls.slice(0, 25).map((u) => (
              <li key={u.url} className="flex items-baseline gap-3 py-2 text-sm">
                <span className={`w-52 shrink-0 truncate ${u.isBrand ? 'font-semibold' : ''}`}>
                  {u.domain}
                  {u.isBrand && <span className="label ml-2">yours</span>}
                </span>
                <a
                  href={u.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 truncate text-muted underline decoration-line hover:text-ink"
                >
                  {u.url}
                </a>
                <span className="label shrink-0">{u.engines.length} engines</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- every prompt, expandable to the raw answers --- */}
      <section className="mb-14">
        <h2 className="mb-1 text-xl font-semibold tracking-tight">Every prompt</h2>
        <p className="mb-6 text-sm text-muted">
          Open a row to read exactly what each model said. This is the part people skip and it is
          the part worth reading - the numbers tell you where you lose, the answers tell you why.
        </p>
        <div className="divide-y divide-line border-y border-line">
          {prompts.map((p) => {
            const r = p.report
            const mentioned = r ? r.engines.filter((e) => e.status === 'success' && e.brandMentioned).length : 0
            return (
              <details key={p.id} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-4 py-3">
                  <span className="label w-24 shrink-0">{TYPE_LABEL[p.type]}</span>
                  <span className="flex-1 text-sm group-open:font-medium">{p.text}</span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {r ? `${mentioned}/${r.enginesAnswered}` : 'failed'}
                  </span>
                </summary>

                {p.error && <p className="pb-4 text-sm text-muted">Error: {p.error}</p>}

                {r && (
                  <div className="space-y-6 pb-6 pl-24">
                    {r.engines.map((e) => (
                      <div key={e.id}>
                        <div className="mb-2 flex flex-wrap items-center gap-3">
                          <span className="text-sm font-medium">{e.label}</span>
                          <span className="label">{e.model}</span>
                          <span className="label">
                            {e.brandMentioned
                              ? `mentioned ${e.mentionCount}x`
                              : e.status === 'success'
                                ? 'not mentioned'
                                : e.status}
                          </span>
                          {e.brandMentioned && (
                            <span className="label">{SENTIMENT_LABEL[e.sentiment]}</span>
                          )}
                          {e.position && <span className="label">rank #{e.position}</span>}
                        </div>
                        <p className="whitespace-pre-wrap border-l border-line pl-4 text-sm leading-relaxed text-muted">
                          {e.text || e.error || 'No answer returned.'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            )
          })}
        </div>
      </section>

      <p className="label">
        Total cost of this run: ${aggregate.totalCostUsd.toFixed(4)}
      </p>
    </div>
  )
}
