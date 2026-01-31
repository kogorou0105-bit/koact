import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  esbuild: {
    jsxFactory: "Koact.createElement",
    jsxFragment: "Koact.Fragment", // 👈 这里的字符串是指向变量名的引用
  },
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
