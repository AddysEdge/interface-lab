/**
 * Integration A UI: request an AI review of the SAVED component and choose
 * which suggestions to apply. Nothing is applied automatically, and
 * accessibility notes are framed as guidance to verify, not certification.
 */
import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { Button } from '../ui'
import { callAction, isRetryable } from '@/lib/api'
import type { ReviewSuggestion } from '@/shared/types'

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; retryable: boolean }
  | { kind: 'ready'; review: ReviewSuggestion }

export function ReviewPanel({
  componentId,
  dirty,
  onApplyDescription,
  onApplyTags,
  onSearchDocs,
}: {
  componentId: string | null
  dirty: boolean
  onApplyDescription: (description: string) => void
  onApplyTags: (tags: string[]) => void
  onSearchDocs: (query: string) => void
}) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [applied, setApplied] = useState<{ description?: boolean; tags?: boolean }>({})

  async function run() {
    if (!componentId) return
    setState({ kind: 'loading' })
    setApplied({})
    const result = await callAction<{ review: ReviewSuggestion }>('reviewComponent', { id: componentId })
    if (result.success) setState({ kind: 'ready', review: result.data.review })
    else setState({ kind: 'error', message: result.error, retryable: isRetryable(result.code) })
  }

  return (
    <section aria-labelledby="review-heading" className="rounded-xl border border-border bg-card p-4" data-testid="review-panel">
      <div className="flex items-center gap-2">
        <h2 id="review-heading" className="flex flex-1 items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden /> AI review
        </h2>
        <Button size="sm" variant="outline" onClick={run} disabled={!componentId} loading={state.kind === 'loading'}>
          {state.kind === 'ready' ? 'Review again' : 'Suggest improvements'}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {!componentId
          ? 'Save a draft first; the review reads your saved code.'
          : dirty
            ? 'You have unsaved changes. The review uses the last saved version.'
            : 'Suggests a description, tags and accessibility improvements. You decide what to apply.'}
      </p>

      {state.kind === 'loading' && <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">Reviewing your component…</p>}

      {state.kind === 'error' && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
          <p>{state.message}</p>
          {state.retryable && <Button size="sm" variant="outline" className="mt-2" onClick={run}>Try again</Button>}
        </div>
      )}

      {state.kind === 'ready' && (
        <div className="mt-3 space-y-4 text-sm" data-testid="review-result">
          {state.review.description && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested description</h3>
              <p className="mt-1">{state.review.description}</p>
              <Button size="sm" variant="ghost" className="mt-1 h-7 px-2" disabled={applied.description}
                onClick={() => { onApplyDescription(state.review.description); setApplied((a) => ({ ...a, description: true })) }}>
                {applied.description ? <><Check aria-hidden /> Applied</> : 'Use this description'}
              </Button>
            </div>
          )}
          {state.review.tags.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested tags</h3>
              <p className="mt-1 flex flex-wrap gap-1.5">
                {state.review.tags.map((tag) => <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-xs">#{tag}</span>)}
              </p>
              <Button size="sm" variant="ghost" className="mt-1 h-7 px-2" disabled={applied.tags}
                onClick={() => { onApplyTags(state.review.tags); setApplied((a) => ({ ...a, tags: true })) }}>
                {applied.tags ? <><Check aria-hidden /> Applied</> : 'Use these tags'}
              </Button>
            </div>
          )}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accessibility guidance</h3>
            {state.review.accessibility.length === 0 ? (
              <p className="mt-1 text-muted-foreground">No specific issues suggested. That is not a guarantee; test with a keyboard and a screen reader.</p>
            ) : (
              <ul className="mt-1 space-y-2">
                {state.review.accessibility.map((item, i) => (
                  <li key={i} className="rounded-lg bg-secondary/60 p-2">
                    <p className="font-medium">{item.issue}</p>
                    <p className="text-muted-foreground">{item.suggestion}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">AI suggestions can be wrong and are not an accessibility certification. Verify each one.</p>
          </div>
          {state.review.docsQuery && (
            <Button size="sm" variant="outline" onClick={() => onSearchDocs(state.review.docsQuery)}>
              Find documentation: “{state.review.docsQuery}”
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
