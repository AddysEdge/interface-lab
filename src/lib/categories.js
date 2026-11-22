// Plain category data shared by server validation, the database migration and tests.
// It must match the Atoms/Molecules entries in src/lib/conts.js and the
// elements_element_id_check constraint in supabase/migrations (both checked by test/unit).

export const ATOM_CATEGORY_IDS = Object.freeze([
	'buttons',
	'inputs',
	'backgrounds',
	'loaders',
	'checkboxes',
	'radio-buttons',
	'selects',
	'switches',
	'tooltips',
	'progress-bars',
])

export const MOLECULE_CATEGORY_IDS = Object.freeze([
	'headers',
	'hero-sections',
	'footers',
	'content-sections',
	'feature-sections',
	'forms',
	'e-commerce',
	'error-pages',
	'cards',
	'ctas',
	'pricing-tables',
	'modals',
	'testimonials',
	'faqs',
	'stats',
	'banners',
])

export const ELEMENT_CATEGORY_IDS = Object.freeze([...ATOM_CATEGORY_IDS, ...MOLECULE_CATEGORY_IDS])

// Grid page sizes per category type (the category listing pages).
export const PAGE_SIZE = Object.freeze({ Atoms: 27, Molecules: 26 })

// Page size of the profile "components" and "likes" tabs.
export const PROFILE_PAGE_SIZE = 12

export function categoryType (categoryId) {
	if (ATOM_CATEGORY_IDS.includes(categoryId)) return 'Atoms'
	if (MOLECULE_CATEGORY_IDS.includes(categoryId)) return 'Molecules'
	return null
}
