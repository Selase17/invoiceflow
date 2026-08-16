import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies /api to the local API so `npm run dev` works without
// nginx in front. In production the built static files are served by the
// frontend's own nginx, and the top-level nginx proxies /api/ to the API —
// see frontend/nginx.conf and the repo-root nginx/nginx.conf.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
