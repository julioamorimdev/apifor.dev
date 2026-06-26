/** @type {import('next').NextConfig} */
const nextConfig = {
  // proxy da API do cérebro em dev
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://localhost:8088/:path*" }];
  },
};
export default nextConfig;
