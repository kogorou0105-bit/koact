import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@koact/react": path.resolve(__dirname, "../../packages/react/src"),
      "@koact/react-dom": path.resolve(
        __dirname,
        "../../packages/react-dom/src",
      ),
    },
  },
});
