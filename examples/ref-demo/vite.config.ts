import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  esbuild: {
    jsxFactory: "Koact.createElement",
    jsxFragment: "Koact.Fragment",
  },
  resolve: {
    alias: {
      "@koact/react": path.resolve(
        __dirname,
        "../../packages/react/src/index.ts",
      ),
      "@koact/react-dom": path.resolve(
        __dirname,
        "../../packages/react-dom/src/index.ts",
      ),
    },
  },
});
