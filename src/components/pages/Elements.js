'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PagesTypes } from '@/lib/conts'
import getElements from '@/lib/actions'
import { applyFilterChange, buildListSearch, parseListState, totalPagesFor } from '@/lib/listState'
import ElementCard, { ElementCardSkeleton } from '../ElementCard'
import Link from 'next/link'
import PaginationFooter from '../Pagination'
import { OctagonAlert, OctagonX, Search } from 'lucide-react'
import Image from 'next/image'
import componentsIcon from '@/assets/icons/components.svg'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

const INITIAL_RESULT = { status: 'loading', elements: [], totalCount: 0 }

export default function Elements ({ data: category, type }) {
	const searchParams = useSearchParams()
	const router = useRouter()
	const pathname = usePathname()
	const pageSize = PagesTypes[type].pageSize

	// The URL is the source of truth: refresh, back/forward and shared links all
	// re-derive the same state, and invalid values fall back to defaults.
	const listState = useMemo(() => parseListState(searchParams), [searchParams])
	const { q, style, sort, page } = listState

	const [result, setResult] = useState(INITIAL_RESULT)
	const [reloadToken, setReloadToken] = useState(0)
	const latestRequest = useRef(0)

	useEffect(() => {
		const requestId = ++latestRequest.current
		setResult(previous => ({ ...previous, status: 'loading' }))

		getElements({ elementId: category.id, page, query: q, sort, style })
			.then(res => {
				// Ignore responses that a newer request has superseded.
				if (requestId !== latestRequest.current) return
				if (!res || res.error) return setResult({ ...INITIAL_RESULT, status: 'error' })
				setResult({ status: 'ready', elements: res.data, totalCount: res.totalCount })
			})
			.catch(() => {
				if (requestId === latestRequest.current) setResult({ ...INITIAL_RESULT, status: 'error' })
			})
	}, [category.id, page, q, sort, style, reloadToken])

	const totalPages = totalPagesFor(result.totalCount, pageSize)
	const isLoading = result.status === 'loading'

	function hrefFor (state) {
		const search = buildListSearch(state)
		return search ? `${pathname}?${search}` : pathname
	}

	// A page past the end (stale link, items removed) moves to the last real page.
	useEffect(() => {
		if (result.status !== 'ready') return
		const lastPage = Math.max(1, totalPages)
		if (page > lastPage) router.replace(hrefFor({ ...listState, page: lastPage }), { scroll: false })
	})

	const handleSearch = (e) => {
		e.preventDefault()
		const formData = new FormData(e.currentTarget)
		const next = applyFilterChange(listState, {
			q: formData.get('q')?.toString() ?? '',
			style: formData.get('style')?.toString() ?? 'all',
			sort: formData.get('sort')?.toString() ?? 'likes',
		})
		const href = hrefFor(next)
		if (buildListSearch(next) === buildListSearch(listState)) setReloadToken(token => token + 1)
		else router.push(href, { scroll: false })
	}

	if (result.status === 'error') return <div className='text-center min-h-[calc(100svh-5rem)] flex justify-center items-center flex-col'>
		<div className='absolute h-[44svh] dark:invert -z-30 pointer-events-none opacity-30 bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]'></div>

		<OctagonX className='size-14 2xl:size-20' />
		<h1 className='text-4xl font-semibold mt-2 2xl:text-6xl'>
			Something went wrong!
		</h1>
		<p className='text-pretty mt-1 text-zinc-900/80 dark:text-white/80 text-lg text-center 2xl:text-2xl'>An unexpected error has occurred. Please try again later.</p>
		<button onClick={() => setReloadToken(token => token + 1)} className='btn btn-primary mt-3 py-1.5 flex gap-1 px-10 shining 2xl:text-lg items-center gradient1'>
			Try again
		</button>
	</div>

	return (
		<div className='section mb-10 relative minHeightScreen flex flex-col'>
			<div className='absolute h-[44svh] dark:invert -z-30 pointer-events-none opacity-30 bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]'></div>

			<article className='flex flex-col md:flex-row gap-3 items-center py-3 2xl:py-4 '>
				<section className='grow'>
					<h1 className='text-3xl inline-block sm:text-4xl not-dark:bg-clip-text bg-linear-to-r to-purple-500 dark:to-purple-600 from-blue-600 dark:via-indigo-600 dark:from-blue-600 not-dark:text-transparent font-bold relative skew-x-6'>
						{category.name}
						<span className='absolute  -top-2.5 -right-6.5 rounded-full aspect-square size-6 2xl:size-6.5 grid place-items-center text-white bg-gradient-to-l from-purple-500 to-blue-500 text-[15px] 2xl:text-base 2xl:pt-0.5 outline-2 outline-zinc-100 dark:outline-zinc-700/50 outline-offset-2'>
							{isLoading ? '?' : result.totalCount}
						</span>
					</h1>
					<p className='max-w-[80ch] text-balance mt-1 text-zinc-900 dark:text-white text-[15px] 2xl:text-base'>
						{PagesTypes[type].description} {category.description}
					</p>
				</section>

				<div className='flex flex-col gap-3 w-full self-end sm:w-auto'>
					<p data-testid='results-summary' aria-busy={isLoading} className={`text-zinc-900/80 w-fit ml-auto dark:text-white/80 text-sm relative text-right after:absolute after:w-full after:h-full dark:after:bg-zinc-800 after:bg-zinc-300 after:rounded-full after:animate-pulse after:top-0 after:left-0 ${isLoading ? 'after:opacity-100' : 'after:pointer-events-none after:opacity-0!'}`}>
						<span className={`transition-opacity ${isLoading ? 'opacity-0' : ''}`}>
							{result.totalCount} element{result.totalCount === 1 ? '' : 's'}.
							Page {totalPages === 0 ? 0 : Math.min(page, totalPages)} of {totalPages}.
						</span>
					</p>

					{/* Remount when the URL changes (e.g. back/forward) so the inputs show the URL's values. */}
					<form key={`${q}|${style}|${sort}`} onSubmit={handleSearch} role='search' className='flex gap-2'>
						<Select avoidCollisions={false} name='style' defaultValue={style} disabled={isLoading}>
							<SelectTrigger aria-label='Styling' className='card-border bg-white dark:bg-zinc-900! border-0!'>
								<SelectValue placeholder='Tailwind or CSS' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='all'>All</SelectItem>
								<SelectItem value='tailwind'>Tailwind</SelectItem>
								<SelectItem value='no-tailwind'>CSS</SelectItem>
							</SelectContent>
						</Select>

						<Select avoidCollisions={false} name='sort' defaultValue={sort} disabled={isLoading}>
							<SelectTrigger aria-label='Sort order' className='card-border bg-white dark:bg-zinc-900! border-0!'>
								<SelectValue placeholder='Sort by' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='likes'>Sort by Likes</SelectItem>
								<SelectItem value='created_at'>Sort by Date</SelectItem>
							</SelectContent>
						</Select>

						<span className='relative'>
							<input
								disabled={isLoading}
								type='search'
								name='q'
								aria-label='Search tags'
								defaultValue={q}
								maxLength={100}
								placeholder='Search...'
								className='w-full sm:max-w-3xs py-1.5 px-4 rounded-md card-border dark:bg-zinc-900/50  bg-white/50 backdrop-blur-xs pr-10'
							/>
							<button type='submit' aria-label='Search' className='absolute cursor-pointer active:scale-95 transition-all top-1/2 right-1 -translate-y-1/2 bg-gradient-to-br btn-primary gradient1 p-1 rounded group'>
								<Search size={20} className='text-white group-hover:scale-105 transition-transform' />
							</button>
						</span>
					</form>
				</div>
			</article>

			<article data-testid='results' aria-busy={isLoading} className='sm:grid flex flex-col gap-4 mt-6 mb-10' style={{
				gridTemplateColumns: PagesTypes[type].gridSize,
				flexGrow: result.elements.length < 1 ? 1 : 0
			}} >
				<ElementsList isLoading={isLoading} elements={result.elements} />
			</article>

			<PaginationFooter totalPages={totalPages} page={page} queries={listState} hrefFor={hrefFor} />
		</div>
	)
}

function ElementsList ({ isLoading, elements }) {
	if (isLoading) return Array.from({ length: PagesTypes.Atoms.pageSize + 1 })
		.map((_, i) => <ElementCardSkeleton key={i} />)

	if (!Array.isArray(elements)) return <div className='h-full w-full col-span-full flex items-center justify-center flex-col '>
		<OctagonAlert size={50} />
		<h1 className='font-semibold text-xl mb-2 mt-2 lg:text-2xl'>Error fetching elements</h1>
		<p className='text-center text-muted-foreground'>An error has occurred while fetching the elements.</p>
		<p className='text-center text-muted-foreground'>Please try again later</p>
	</div>

	if (elements.length < 1) return <div className='h-full w-full col-span-full flex items-center justify-center flex-col gap-4'>
		<Image src={componentsIcon} alt='empty' width={100} height={100} className='dark:invert' />
		<p className='text-center text-muted-foreground'>No components found <span className='italic font-medium'>yet</span>. But you can change that</p>
		<Link href='/create' className='btn-primary shining px-7 py-1.5 rounded-lg bg-gradient-to-l text-[15px] tracking-wide font-medium text-white transition-all active:scale-95  cursor-pointer  gradient1'>Create one</Link>
	</div>

	return elements.map(el => <ElementCard data={el} key={el.id} />)
}
