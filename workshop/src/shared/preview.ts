/**
 * Isolated component preview.
 *
 * Submitted HTML/CSS is untrusted. It is rendered in an <iframe sandbox="">
 * (no allow-* tokens), which gives the frame an opaque origin: no cookies, no
 * localStorage/IndexedDB, no access to window.parent, no scripts, no forms,
 * no popups and no top-level navigation. The document also carries a CSP that
 * blocks scripts and every network fetch except inline styles and data: URIs,
 * so a preview cannot phone home (no tracking pixels, no remote fonts).
 *
 * Component previews currently support HTML and CSS only.
 */

/** iframe attributes. `sandbox` MUST stay empty: adding tokens weakens isolation. */
export const PREVIEW_SANDBOX = ''
export const PREVIEW_REFERRER_POLICY = 'no-referrer'

export const PREVIEW_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "media-src 'none'",
  "script-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ')

/**
 * Prevent user CSS from closing the <style> element early. HTML parsing ends a
 * raw-text style element at "</style" (case-insensitive); escaping the slash
 * keeps the text inert for HTML while leaving valid CSS unaffected.
 */
export function escapeStyleText(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1')
}

/**
 * `scrollable: false` is for small, non-interactive thumbnails: overflow is clipped
 * instead of showing scrollbars inside the card.
 */
export function buildPreviewDocument({ html, css, dark = false, scrollable = true }: { html: string; css: string; dark?: boolean; scrollable?: boolean }): string {
  return `<!doctype html>
<html lang="en"${dark ? ' class="dark"' : ''}>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;background:${dark ? '#0b0b12' : '#ffffff'};color:${dark ? '#f4f4f5' : '#18181b'}}
${scrollable ? '' : 'html,body{overflow:hidden}\n'}</style>
<style>${escapeStyleText(css)}</style>
</head>
<body>
${html}
</body>
</html>`
}
