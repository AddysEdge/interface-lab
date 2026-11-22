/**
 * "My components" (/studio): the signed-in user's drafts and published
 * components. The query is scoped to ownerId = me, and the read rule would
 * drop anyone else's drafts anyway.
 */
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useQuery } from 'deepspace'
import { PenSquare, Plus } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import { ComponentCard, ComponentCardSkeleton } from '@/components/workshop/ComponentCard'
import { LIMITS } from '@/shared/limits'
import type { ComponentData } from '@/shared/types'

export default function StudioPage() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const { records, status } = useQuery<ComponentData>('components', {
    where: { ownerId: userId ?? '__none__' },
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: LIMITS.componentsPerUser,
  })
  const drafts = useMemo(() => records.filter((r) => r.data.status !== 'published'), [records])
  const published = useMemo(() => records.filter((r) => r.data.status === 'published'), [records])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:py-12">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">My components</h1>
          <p className="mt-1 text-sm text-muted-foreground">Drafts are private to you. Published components appear in the library.</p>
        </div>
        <Link to="/studio/new" className="gradient-brand inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium">
          <Plus className="size-4" aria-hidden /> New component
        </Link>
      </header>

      {status === 'loading' ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <ComponentCardSkeleton key={i} />)}</div>
      ) : status === 'error' ? (
        <EmptyState title="Couldn’t load your components" description="The connection retries automatically." action={{ label: 'Reload', onClick: () => window.location.reload() }} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={<PenSquare />}
          title="You haven’t created anything yet"
          description="Start from a blank component: write HTML and CSS, watch the live preview, save a draft and publish when ready."
          action={{ label: 'Create your first component', onClick: () => navigate('/studio/new') }}
        />
      ) : (
        <>
          <Section title={`Drafts (${drafts.length})`} empty="No drafts.">
            {drafts.map((r) => <ComponentCard key={r.recordId} id={r.recordId} data={r.data} href={`/studio/${r.recordId}`} />)}
          </Section>
          <Section title={`Published (${published.length})`} empty="Nothing published yet.">
            {published.map((r) => <ComponentCard key={r.recordId} id={r.recordId} data={r.data} />)}
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>
      )}
    </section>
  )
}
