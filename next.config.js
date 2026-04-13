/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/',
        destination: '/readiness.html',
      },
    ]
  },
}
module.exports = nextConfig
