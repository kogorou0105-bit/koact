import React from "@koact/react";
import { createRoot } from "@koact/react-dom";
import App from "./App"; // 引入刚才拆分出来的组件

const container = document.getElementById("root")!;
createRoot(container).render(<App />);
