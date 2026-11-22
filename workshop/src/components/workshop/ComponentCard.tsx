import { Link } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { Badge } from '../ui'
import { categoryLabel } from '../../shared/categories'
import type { ComponentData } from '../../shared/types'
import { PreviewFrame } from './PreviewFrame'

export function ComponentCard({ id, data, href }: { id: string; data: ComponentData; href?: string }) {
  const draft = data.status !== 'published'
  return (
    <article data-testid="component-card" className="group relative overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/60">
      <div className="relative aspect-[16/10] overflow-hidden bg-white">
        <PreviewFrame html={data.html} css={data.css} title={`Preview of ${data.title}`} interactive={false} />
      </div>
      <div className="flex flex-col gap-1.5 border-t border-border p-3">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            <Link to={href ?? `/c/${id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {data.title}
            </Link>
          </h3>
          {draft && <Badge variant="warning" size="sm">Draft</Badge>}
          {Boolean(data.isSample) && <Badge variant="outline" size="sm">Sample</Badge>}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{categoryLabel(data.category)}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{data.authorName || 'Member'}</span>
          <span className="flex-1" />
          <span className="inline-flex items-center gap-1" aria-label={`${data.feedbackCount ?? 0} feedback`}>
            <MessageSquare className="size-3.5" aria-hidden />
            {data.feedbackCount ?? 0}
          </span>
        </div>
      </div>
    </article>
  )
}

export function ComponentCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" aria-hidden>
      <div className="aspect-[16/10] animate-pulse bg-muted" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}
