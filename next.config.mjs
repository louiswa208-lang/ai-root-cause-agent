/** @type {import('next').NextConfig} */
const nextConfig = {
  // SheetJS 只在服务端使用，不打进前端包
  serverExternalPackages: ["xlsx"],
  // 演示数据需要在 Serverless Function 里用 fs 读取，必须显式纳入打包追踪
  outputFileTracingIncludes: {
    "/api/dataset": ["./public/demo/**"],
    "/api/diagnose": ["./public/demo/**"],
  },
};

export default nextConfig;
