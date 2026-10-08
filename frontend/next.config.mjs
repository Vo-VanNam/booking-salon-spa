/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // URL của API backend: chỉ đọc từ biến môi trường, không hardcode secret nào ở client.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8100',
  },
};

export default nextConfig;
