import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  esbuild: {
    // 遇到 JSX 就编译成 React.createElement
    // 这里的 React 指的是你代码里 import React from '@koact/react' 的那个 React
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
  },
});
