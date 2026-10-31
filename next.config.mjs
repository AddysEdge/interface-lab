/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
	experimental: {
		viewTransition: true
	},
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'img.clerk.com',
			},
			...(process.env.COMPONENT_IMAGE_HOST ? [{
				protocol: 'https',
				hostname: process.env.COMPONENT_IMAGE_HOST,
			}] : [])
		],
	},
}

export default nextConfig
