import { memo, useEffect, useMemo, useRef } from 'react'
import { buildPreviewDocument, PREVIEW_REFERRER_POLICY, PREVIEW_SANDBOX, PREVIEW_SANDBOX_WITH_SCRIPTS } from '../../shared/preview'
import { cn } from '@/lib/utils'

/**
 * Renders untrusted component code in an isolated frame (see src/shared/preview.ts).
 *
 * Scripts run only when `runScripts` is true; the sandbox then gains exactly
 * `allow-scripts` and never `allow-same-origin`. A script cannot reach this
 * page, but it can navigate its own frame; the second load event that causes
 * is reported through `onNavigated` so the caller can switch scripts off,
 * which reloads the frame from our own document.
 */
function PreviewFrameInner({
  html,
  css,
  js = '',
  runScripts = false,
  title,
  dark = false,
  className,
  interactive = true,
  onNavigated,
}: {
  html: string
  css: string
  js?: string
  runScripts?: boolean
  title: string
  dark?: boolean
  className?: string
  interactive?: boolean
  onNavigated?: () => void
}) {
  const scripts = runScripts && interactive
  const srcDoc = useMemo(
    () => buildPreviewDocument({ html, css, js, runScripts: scripts, dark, scrollable: interactive }),
    [html, css, js, scripts, dark, interactive],
  )
  const loads = useRef(0)
  useEffect(() => {
    loads.current = 0
  }, [srcDoc])

  return (
    <iframe
      // A new element per document, so sandbox changes always apply to a fresh frame.
      key={scripts ? 'scripts' : 'static'}
      data-testid="component-preview"
      title={title}
      sandbox={scripts ? PREVIEW_SANDBOX_WITH_SCRIPTS : PREVIEW_SANDBOX}
      referrerPolicy={PREVIEW_REFERRER_POLICY}
      srcDoc={srcDoc}
      loading="lazy"
      tabIndex={interactive ? 0 : -1}
      onLoad={() => {
        loads.current += 1
        if (scripts && loads.current > 1) onNavigated?.()
      }}
      className={cn('h-full w-full border-0 bg-white', !interactive && 'pointer-events-none', className)}
    />
  )
}

export const PreviewFrame = memo(PreviewFrameInner)
