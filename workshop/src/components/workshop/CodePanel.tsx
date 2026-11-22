import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button, useToast } from '../ui'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for browsers/contexts without the async clipboard API.
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

/** Read-only code view with a copy button (HTML / CSS tabs). */
export function CodePanel({ html, css }: { html: string; css: string }) {
  const [tab, setTab] = useState<'html' | 'css'>('html')
  const [copied, setCopied] = useState<string | null>(null)
  const { success, error } = useToast()
  const code = tab === 'html' ? html : css

  async function handleCopy() {
    if (await copyText(code)) {
      setCopied(tab)
      success(`${tab.toUpperCase()} copied`)
      setTimeout(() => setCopied(null), 1500)
    } else {
      error('Copy failed', 'Select the code and copy it manually.')
    }
  }

  return (
    <section aria-label="Source code" className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center gap-1 border-b border-border p-1.5" role="tablist">
        {(['html', 'css'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wide ${tab === value ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {value}
          </button>
        ))}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!code} aria-label={`Copy ${tab.toUpperCase()}`}>
          {copied === tab ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied === tab ? 'Copied' : `Copy ${tab.toUpperCase()}`}
        </Button>
      </div>
      <pre className="code-area max-h-[420px] min-h-[160px] overflow-auto p-4 text-foreground" data-testid={`code-${tab}`}>
        <code>{code || `/* No ${tab.toUpperCase()} */`}</code>
      </pre>
    </section>
  )
}
