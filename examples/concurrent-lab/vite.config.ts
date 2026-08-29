import { defineConfig } from "vite";
import koactDevTools from "vite-plugin-koact-devtools";

export default defineConfig({
  plugins: [koactDevTools()],
  esbuild: {
    jsxFactory: "Koact.createElement",
    jsxFragment: "Koact.Fragment",
  },
});
