/**
 * Landing page — a STATIC, prerendered page (no auth fetch, no WebSocket).
 * The live app lives under /home (library), /c/:id and /studio.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

const STEPS = [
  { title: 'Browse', body: 'Search a small, curated library of HTML/CSS components by title, category or tag.' },
  { title: 'Create', body: 'Write HTML and CSS with a live preview, save private drafts, then publish.' },
  { title: 'Improve', body: 'Ask the AI reviewer for tags, a description and accessibility pointers, with links to real docs.' },
  { title: 'Discuss', body: 'Share the link. Others copy the code and leave feedback; creators can get an email.' },
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
        <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh] opacity-70" aria-hidden />
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">InterfaceLab</p>
        <h1 className="mb-4 max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          A workshop for <span className="text-gradient-brand">reusable UI components</span>
        </h1>
        <p className="mb-8 max-w-xl text-muted-foreground">
          Preview community HTML/CSS components in an isolated sandbox, copy the code, and help creators improve them with
          real-time feedback.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/home" className="gradient-brand inline-flex items-center rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90">
            Browse components
          </Link>
          <Link to="/studio/new" className="inline-flex items-center rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground hover:bg-accent">
            Create one
          </Link>
        </div>
        <ol className="mt-16 grid w-full max-w-5xl gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs font-semibold text-primary">0{index + 1}</p>
              <h2 className="mt-1 font-semibold text-foreground">{step.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </>
  )
}
