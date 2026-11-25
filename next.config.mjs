/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
];

const nextConfig = {
  reactStrictMode: true,
  // Next 15+ / Turbopack 下需将 Prisma 客户端与 bcryptjs 标记为外部包，
  // 否则打包后在 Route Handler 中运行会报错
  serverExternalPackages: ["@prisma/client", "bcryptjs", "sharp"],
  // Next 16 默认只允许 localhost 访问 dev 资源；局域网 IP 访问时也要放行，否则页面卡在初始加载态
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.50.87"],
  // next start 只提供构建时已存在的 public 文件，上传后新增的图片会 404；
  // 因此把 /uploads/* 交给路由从磁盘读取（见 src/app/api/uploads/[...path]/route.ts）
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/uploads/:path*", destination: "/api/uploads/:path*" },
      ],
    };
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
