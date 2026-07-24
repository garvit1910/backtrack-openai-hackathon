/** @type {import('next').NextConfig} */
const nextConfig = {
  // SSE: compression buffers the event stream; /api/run must flush per event
  compress: false,
};

export default nextConfig;
