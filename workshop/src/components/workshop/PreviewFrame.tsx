import { memo, useMemo } from 'react'
import { buildPreviewDocument, PREVIEW_REFERRER_POLICY, PREVIEW_SANDBOX } from '../../shared/preview'
import { cn } from '@/lib/utils'

/**
 * Renders untrusted HTML/CSS in an isolated frame. See src/shared/preview.ts
 * for the isolation model; `sandbox` must remain empty.
 */
function PreviewFrameInner({
  html,
  css,
  title,
  dark = false,
  className,
  interactive = true,
}: {
  html: string
  css: string
  title: string
  dark?: boolean
  className?: string
  interactive?: boolean
}) {
  const srcDoc = useMemo(() => buildPreviewDocument({ html, css, dark }), [html, css, dark])
  return (
    <iframe
      data-testid="component-preview"
      title={title}
      sandbox={PREVIEW_SANDBOX}
      referrerPolicy={PREVIEW_REFERRER_POLICY}
      srcDoc={srcDoc}
      loading="lazy"
      tabIndex={interactive ? 0 : -1}
      className={cn('h-full w-full border-0 bg-white', !interactive && 'pointer-events-none', className)}
    />
  )
}

export const PreviewFrame = memo(PreviewFrameInner)
