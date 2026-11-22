/**
 * Integration B UI: search technical documentation (MDN, W3C, web.dev, ...)
 * via Exa. Shows the real source titles and links Exa returns.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BookOpen, ExternalLink } from 'lucide-react'
import { Button } from '../ui'
import { callAction, isRetryable } from '@/lib/api'
import { LIMITS } from '@/shared/limits'
import type { DocResult } from '@/shared/types'

type State =
  | { kind: 'idle' }
  | { kind: 'loading'; query: string }
  | { kind: 'error'; query: string; message: string; retryable: boolean }
  | { kind: 'ready'; query: string; results: DocResult[] }

export function DocsPanel({ suggestedQuery, requestedQuery }: { suggestedQuery: string; requestedQuery: { query: string; nonce: number } | null }) {
  const [query, setQuery] = useState(suggestedQuery)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const latest = useRef(0)

  async function search(text: string) {
    const trimmed = text.trim()
    if (trimmed.length < 2) return
    const requestId = ++latest.current
    setState({ kind: 'loading', query: trimmed })
    const result = await callAction<{ results: DocResult[] }>('searchDocs', { query: trimmed })
    if (requestId !== latest.current) return // a newer search superseded this one
    if (result.success) setState({ kind: 'ready', query: trimmed, results: result.data.results })
    else setState({ kind: 'error', query: trimmed, message: result.error, retryable: isRetryable(result.code) })
  }

  // A review suggestion can ask for a search.
  useEffect(() => {
    if (requestedQuery) {
      setQuery(requestedQuery.query)
      void search(requestedQuery.query)
    }
  }, [requestedQuery])

  function submit(event: FormEvent) {
    event.preventDefault()
    void search(query)
  }

  return (
    <section aria-labelledby="docs-heading" className="rounded-xl border border-border bg-card p-4" data-testid="docs-panel">
      <h2 id="docs-heading" className="flex items-center gap-2 text-sm font-semibold">
        <BookOpen className="size-4 text-primary" aria-hidden /> Documentation search
      </h2>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Documentation search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={LIMITS.docsQueryMax}
            placeholder="e.g. accessible toggle switch"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <Button type="submit" size="sm" loading={state.kind === 'loading'} disabled={query.trim().length < 2}>Search</Button>
      </form>
      <p className="mt-1 text-xs text-muted-foreground">Searches MDN, W3C, web.dev, WebAIM, A11Y Project and CSS-Tricks.</p>

      {state.kind === 'error' && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
          <p>{state.message}</p>
          {state.retryable && <Button size="sm" variant="outline" className="mt-2" onClick={() => search(state.query)}>Try again</Button>}
        </div>
      )}
      {state.kind === 'ready' && state.results.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">No documentation found for “{state.query}”. Try different words.</p>
      )}
      {state.kind === 'ready' && state.results.length > 0 && (
        <ul className="mt-3 space-y-2" data-testid="docs-results">
          {state.results.map((doc) => (
            <li key={doc.url} className="rounded-lg bg-secondary/60 p-2 text-sm">
              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                {doc.title} <ExternalLink className="size-3" aria-hidden />
              </a>
              <p className="text-xs text-muted-foreground">{doc.domain}</p>
              {doc.snippet && <p className="mt-1 text-xs text-foreground/80">{doc.snippet}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
