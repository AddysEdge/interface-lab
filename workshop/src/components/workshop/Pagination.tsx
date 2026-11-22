import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buildSearch, type ListState } from '../../shared/listState'
import { cn } from '@/lib/utils'

/** Page numbers with ellipses, e.g. [1, '…', 4, 5, 6, '…', 9]. */
export function pageWindow(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: Array<number | '…'> = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push('…')
  for (let page = start; page <= end; page++) pages.push(page)
  if (end < total - 1) pages.push('…')
  pages.push(total)
  return pages
}

/**
 * Real links (not click handlers), built from the full list state, so every
 * page URL keeps q/category/sort and browser back/forward just works.
 */
export function Pagination({ state, pages, page }: { state: ListState; pages: number; page: number }) {
  if (pages <= 1) return null
  const href = (target: number) => {
    const search = buildSearch({ ...state, page: target })
    return search ? `?${search}` : '?'
  }
  const linkClass = 'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm'
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-1" data-testid="pagination">
      {page > 1 ? (
        <Link to={href(page - 1)} className={cn(linkClass, 'hover:bg-accent')} aria-label="Previous page">
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
      ) : (
        <span className={cn(linkClass, 'opacity-40')} aria-hidden>
          <ChevronLeft className="size-4" />
        </span>
      )}
      {pageWindow(page, pages).map((entry, index) =>
        entry === '…' ? (
          <span key={`gap-${index}`} className={cn(linkClass, 'text-muted-foreground')}>…</span>
        ) : (
          <Link
            key={entry}
            to={href(entry)}
            aria-current={entry === page ? 'page' : undefined}
            className={cn(linkClass, entry === page ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
          >
            {entry}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link to={href(page + 1)} className={cn(linkClass, 'hover:bg-accent')} aria-label="Next page">
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span className={cn(linkClass, 'opacity-40')} aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  )
}
