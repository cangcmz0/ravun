import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Geliştirme sırasında /api isteklerini aynı sunucu koduna (server/) yönlendirir;
// böylece `npm run dev` ile site + panel + API birlikte çalışır.
// .env içindeki DATABASE_URL / ADMIN_PIN değerleri sunucu koduna aktarılır.
function ravunApi() {
  return {
    name: "ravun-api",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
      server.middlewares.use("/api", async (req, res) => {
        const { handleNode } = await import("./server/http.js");
        return handleNode(req, res);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    ravunApi(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/admin/routes",
      generatedRouteTree: "./src/admin/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/admin"),
    },
  },
});
