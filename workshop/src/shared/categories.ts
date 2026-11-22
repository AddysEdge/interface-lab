/** The workshop's deliberately small category set (shared by UI, validation and schema). */
export const CATEGORIES = [
  { id: 'buttons', label: 'Buttons' },
  { id: 'cards', label: 'Cards' },
  { id: 'forms', label: 'Forms & inputs' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'feedback', label: 'Alerts & loaders' },
  { id: 'layout', label: 'Layout & sections' },
] as const

export type CategoryId = (typeof CATEGORIES)[number]['id']

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]]

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? 'Uncategorized'
}
