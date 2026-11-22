import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from '@/components/ui/pagination'
import { useRouter } from 'next/navigation'
import { buildListSearch } from '@/lib/listState'

/**
 * Two modes:
 * - URL mode (category pages): pass `queries` (the parsed list state) and
 *   optionally `hrefFor(state)`. Every link keeps q/style/sort, navigation goes
 *   through the URL, and the page component re-derives its state from it.
 * - Local mode (profile tabs): pass `disabledParams` and `setPage`.
 */
export default function PaginationFooter ({ totalPages, page, setPage, queries, hrefFor, disabledParams = false }) {
	const router = useRouter()

	const href = (target) => {
		if (disabledParams) return '#'
		const state = { ...queries, page: target }
		if (hrefFor) return hrefFor(state)
		const search = buildListSearch(state)
		return search ? `?${search}` : '?'
	}

	const handlePageChange = (target) => {
		if (target < 1 || target > totalPages || target === page) return
		if (disabledParams) setPage?.(target)
		else router.push(href(target), { scroll: false })
	}

	const generatePageNumbers = (current, total) => {
		const pages = []

		if (total <= 5) {
			for (let i = 1; i <= total; i++) pages.push(i)
		} else {
			if (current > 2) pages.push(1)
			if (current > 3) pages.push('...')

			const start = Math.max(2, current - 1)
			const end = Math.min(total - 1, current + 1)
			for (let i = start; i <= end; i++) pages.push(i)

			if (current < total - 2) pages.push('...')
			if (current < total) pages.push(total)
		}

		return pages
	}

	if (totalPages > 1) return <Pagination className='mt-8'>
		<PaginationContent>
			<PaginationItem>
				<PaginationPrevious
					className={page > 1 ? 'cursor-pointer' : 'cursor-not-allowed pointer-events-none'}
					href={href(page - 1)}
					onClick={(e) => {
						e.preventDefault()
						handlePageChange(page - 1)
					}}
				/>
			</PaginationItem>

			{generatePageNumbers(page, totalPages).map((p, i) => (
				<PaginationItem key={i}>
					{p === '...' ? (
						<PaginationEllipsis />
					) : (
						<PaginationLink
							href={href(p)}
							isActive={p === page}
							onClick={(e) => {
								e.preventDefault()
								handlePageChange(p)
							}}
						>
							{p}
						</PaginationLink>
					)}
				</PaginationItem>
			))}

			<PaginationItem>
				<PaginationNext
					href={href(page + 1)}
					className={page < totalPages ? 'cursor-pointer' : 'cursor-not-allowed pointer-events-none'}
					onClick={(e) => {
						e.preventDefault()
						handlePageChange(page + 1)
					}}
				/>
			</PaginationItem>
		</PaginationContent>
	</Pagination>
}
