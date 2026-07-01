/** @type {import('next').NextConfig} */
// NEXT_EXPORT=1  -> build estático (out/) p/ embarcar no app desktop (Tauri).
// Em dev, mantém o proxy /api -> cérebro local.
const exporting = process.env.NEXT_EXPORT === "1";

const nextConfig = exporting
  ? {
      output: "export",
      images: { unoptimized: true },
      // trailingSlash gera out/<rota>/index.html — sem isso, o app desktop (Tauri
      // servindo o out/ estático) não resolve /queue, /config etc. e cai no index
      // (parecia "clicar num item e ir pra outra tela").
      trailingSlash: true,
    }
  : {
      async rewrites() {
        return [{ source: "/api/:path*", destination: "http://localhost:8088/:path*" }];
      },
    };

export default nextConfig;
