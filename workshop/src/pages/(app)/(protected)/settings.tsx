/**
 * Settings (/settings, sign-in required).
 *
 * The feedback-email preference is written straight from the browser: the
 * preferences collection binds userId to the caller, allows one row per user
 * (uniqueOn), limits writes to `notifyOnFeedback` (writableFields) and is
 * own-only. Emails go to the account email shown below, which comes from
 * the sign-in provider and cannot be changed here.
 */
import { useState } from 'react'
import { signOut, useMutations, useQuery, useUser } from 'deepspace'
import { Bell } from 'lucide-react'
import { Button, Switch, useToast } from '@/components/ui'
import type { PreferencesData } from '@/shared/types'

export default function SettingsPage() {
  const { user } = useUser()
  const { success, error } = useToast()
  const { records, status } = useQuery<PreferencesData>('preferences', { limit: 1 })
  const { ready, createConfirmed, putConfirmed } = useMutations<Partial<PreferencesData>>('preferences')
  const [saving, setSaving] = useState(false)
  const pref = records[0]
  const enabled = Boolean(pref?.data.notifyOnFeedback)

  async function toggle(next: boolean) {
    setSaving(true)
    try {
      if (pref) await putConfirmed(pref.recordId, { notifyOnFeedback: next })
      else await createConfirmed({ notifyOnFeedback: next })
      success(next ? 'Feedback emails on' : 'Feedback emails off')
    } catch (e) {
      error('Could not save your preference', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="mb-8 text-3xl font-bold tracking-tight">Settings</h1>

        <section className="rounded-xl border border-border bg-card p-6" aria-labelledby="notifications-heading">
          <h2 id="notifications-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Bell className="size-5" aria-hidden /> Notifications
          </h2>
          <div className="mt-4 flex items-start gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium" id="notify-label">Email me when someone leaves feedback</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sent to {user?.email ?? 'your account email'} when another signed-in user comments on or replies to one of your
                published components. One email per feedback item, even if a post is retried.
              </p>
            </div>
            <Switch
              aria-labelledby="notify-label"
              data-testid="notify-toggle"
              checked={enabled}
              disabled={!ready || status !== 'ready' || saving}
              onCheckedChange={(checked) => void toggle(checked)}
            />
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Your account</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Name (shown on your components and feedback)</dt>
              <dd className="text-foreground">{user?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-foreground">{user?.email ?? '—'}</dd>
            </div>
          </dl>
          <Button variant="secondary" className="mt-6" onClick={() => signOut()}>
            Sign out
          </Button>
        </section>
      </div>
    </div>
  )
}
