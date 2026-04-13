/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/',
        destination: '/readiness.html',
        permanent: false,
      },
    ]
  },
}
module.exports = nextConfig
