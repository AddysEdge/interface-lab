/**
 * Isolated component preview.
 *
 * Submitted code is untrusted. It is rendered in a sandboxed <iframe> WITHOUT
 * `allow-same-origin`, which gives the frame an opaque origin: no cookies, no
 * localStorage/IndexedDB, no access to window.parent, no forms, no popups, no
 * modal dialogs and no top-level navigation. The document carries a CSP that
 * blocks remote subresources and network APIs (tracking pixels, remote fonts,
 * fetch/XHR and WebSockets); only inline styles, data: images/fonts and, when enabled, the
 * component's own inline script are allowed.
 *
 * Scripts are OFF by default (`sandbox=""`, `script-src 'none'`). They run only
 * when a viewer explicitly chooses to (detail page) or the author enables them
 * (editor): then the sandbox gains exactly `allow-scripts` and the CSP allows
 * the inline script. Library thumbnails never run scripts. A script can still
 * navigate its own frame, which can initiate a remote request before PreviewFrame
 * detects the load and resets the preview with scripts off.
 */

/** iframe sandbox tokens. Never add allow-same-origin, allow-top-navigation, allow-popups, allow-forms or allow-modals. */
export const PREVIEW_SANDBOX = ''
export const PREVIEW_SANDBOX_WITH_SCRIPTS = 'allow-scripts'
export const PREVIEW_REFERRER_POLICY = 'no-referrer'

function csp(runScripts: boolean): string {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    'font-src data:',
    "media-src 'none'",
    "connect-src 'none'",
    runScripts ? "script-src 'unsafe-inline'" : "script-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')
}

/** The no-scripts policy (kept as a constant for tests and documentation). */
export const PREVIEW_CSP = csp(false)
export const PREVIEW_CSP_WITH_SCRIPTS = csp(true)

/**
 * Prevent user CSS from closing the <style> element early. HTML parsing ends a
 * raw-text style element at "</style" (case-insensitive); escaping the slash
 * keeps the text inert for HTML while leaving valid CSS unaffected.
 */
export function escapeStyleText(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1')
}

/**
 * Prevent user JavaScript from closing the <script> element early or entering
 * the HTML parser's "script data escaped" states. Inside string literals and
 * regexes "\/" and "\!" are equivalent to "/" and "!", so valid code keeps working.
 */
export function escapeScriptText(js: string): string {
  return js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--')
}

export interface PreviewOptions {
  html: string
  css: string
  js?: string
  /** Include and allow the component's script. Off by default. */
  runScripts?: boolean
  dark?: boolean
  /** `false` for small, non-interactive thumbnails: overflow is clipped instead of scrolling. */
  scrollable?: boolean
}

export function buildPreviewDocument({ html, css, js = '', runScripts = false, dark = false, scrollable = true }: PreviewOptions): string {
  const withScript = runScripts && js.trim().length > 0
  return `<!doctype html>
<html lang="en"${dark ? ' class="dark"' : ''}>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp(withScript)}">
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
${withScript ? `<script>${escapeScriptText(js)}</script>\n` : ''}</body>
</html>`
}
