console.log(
  "%c[Koact DevTools] Client Injected!",
  "color: green; font-weight: bold;",
);

// ==========================================
// 1. 全局状态管理 (解决时序问题)
// ==========================================
const store = {
  lastFiberRoot: null, // 缓存最新的 Fiber 数据
  isMermaidReady: false, // 标记库是否加载完成
  isPanelVisible: false,
};

// ==========================================
// 2. 动态加载 Mermaid 库 (带回调)
// ==========================================
const script = document.createElement("script");
script.src = "https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js";
script.onload = () => {
  console.log("[DevTools] Mermaid Library Loaded.");
  store.isMermaidReady = true;
  // 库加载完了，如果有缓存的数据，立刻渲染
  if (store.lastFiberRoot) {
    renderMermaid(store.lastFiberRoot);
  } else {
    updateStatus("Ready. Waiting for Koact update...");
  }
};
script.onerror = () => {
  updateStatus("Error: Failed to load Mermaid library from CDN.");
};
document.head.appendChild(script);

// ==========================================
// 3. 核心算法 (保持不变)
// ==========================================
function escapeLabel(str) {
  if (!str) return "";
  return str.replace(/"/g, "'").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getDisplayName(fiber) {
  if (!fiber) return "Unknown";
  const tag = fiber.effectTag ? `<br/>(${fiber.effectTag})` : "";
  let name = "Root";
  if (typeof fiber.type === "string") name = fiber.type;
  else if (typeof fiber.type === "function") name = fiber.type.name || "Fn";
  return escapeLabel(name) + tag;
}

let nodeIdCounter = 0;
const fiberIdMap = new WeakMap();
function getFiberId(fiber) {
  if (!fiberIdMap.has(fiber)) fiberIdMap.set(fiber, `N${nodeIdCounter++}`);
  return fiberIdMap.get(fiber);
}

function generateMermaidGraph(fiber) {
  if (!fiber) return "";
  let graph = "";
  const parentId = getFiberId(fiber);
  const parentLabel = getDisplayName(fiber);

  let styleClass = "";
  if (fiber.effectTag === "PLACEMENT") styleClass = ":::placement";
  else if (fiber.effectTag === "UPDATE") styleClass = ":::update";
  else if (fiber.effectTag === "DELETION") styleClass = ":::deletion";

  graph += `${parentId}["${parentLabel}"]${styleClass}\n`;

  if (fiber.child) {
    let child = fiber.child;
    while (child) {
      const childId = getFiberId(child);
      graph += `${parentId} --> ${childId}\n`;
      graph += generateMermaidGraph(child);
      child = child.sibling;
    }
  }
  return graph;
}

// ==========================================
// 4. UI 构建
// ==========================================
const PANEL_ID = "koact-devtools-panel-root";

const style = document.createElement("style");
style.textContent = `
  #${PANEL_ID} {
    position: fixed;
    top: 100px;
    left: 100px;
    width: 700px;
    height: 500px;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    display: none;
    flex-direction: column;
    z-index: 99999;
    font-family: sans-serif;
    border: 1px solid #ddd;
    overflow: hidden;
  }
  #koact-header {
    padding: 10px 15px;
    background: #2c3e50;
    color: #fff;
    font-weight: 600;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: grab;
    user-select: none;
  }
  #koact-header:active { cursor: grabbing; }
  
  #koact-toolbar {
    padding: 6px 10px;
    background: #f1f2f6;
    border-bottom: 1px solid #ddd;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .koact-btn {
    padding: 4px 8px;
    border: 1px solid #ccc;
    background: #fff;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .koact-btn:hover { background: #e9ecef; }

  #koact-content-wrapper {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: #f8f9fa;
    background-image: radial-gradient(#cbd5e0 1px, transparent 1px);
    background-size: 20px 20px;
  }

  /* 状态提示文字 */
  #koact-status {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #888;
    pointer-events: none;
    text-align: center;
  }

  #koact-graph-container {
    position: absolute;
    top: 0; 
    left: 0;
    transform-origin: 0 0;
    /* 关键：确保 SVG 容器有大小，否则可能不显示 */
    min-width: 100px;
    min-height: 100px;
  }

  #koact-resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 15px;
    height: 15px;
    cursor: nwse-resize;
    background: linear-gradient(135deg, transparent 50%, #2c3e50 50%);
  }

  #koact-fab {
    position: fixed;
    bottom: 30px;
    right: 30px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: #2c3e50;
    color: #61dafb;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 100000;
    border: 2px solid #61dafb;
    transition: transform 0.2s;
  }
  #koact-fab:hover { transform: scale(1.1); }
`;
document.head.appendChild(style);

const panel = document.createElement("div");
panel.id = PANEL_ID;
panel.innerHTML = `
  <div id="koact-header">
    <span>⚛️ Koact Viz</span>
    <span id="koact-close" style="cursor:pointer; font-size:18px">×</span>
  </div>
  <div id="koact-toolbar">
    <button class="koact-btn" id="btn-reset">Reset</button>
    <button class="koact-btn" id="btn-zoom-in">+</button>
    <button class="koact-btn" id="btn-zoom-out">-</button>
    <span style="font-size:11px; color:#666; margin-left:auto">Drag canvas / Scroll zoom</span>
  </div>
  <div id="koact-content-wrapper">
    <div id="koact-status">Initializing Mermaid...</div>
    <div id="koact-graph-container"></div>
  </div>
  <div id="koact-resize-handle"></div>
`;
document.body.appendChild(panel);

const fab = document.createElement("div");
fab.id = "koact-fab";
fab.innerHTML = "Ko";
document.body.appendChild(fab);

// ==========================================
// 5. 交互引擎 (Drag / Zoom)
// ==========================================
const state = {
  scale: 1,
  x: 0,
  y: 0,
  isPanning: false,
  lastX: 0,
  lastY: 0,
};

const els = {
  panel: panel,
  header: document.getElementById("koact-header"),
  wrapper: document.getElementById("koact-content-wrapper"),
  container: document.getElementById("koact-graph-container"),
  status: document.getElementById("koact-status"),
  resize: document.getElementById("koact-resize-handle"),
};

function updateTransform() {
  els.container.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
}

function updateStatus(msg) {
  els.status.style.display = msg ? "block" : "none";
  els.status.innerText = msg;
}

// 面板拖拽
let isPanelDrag = false;
let startPanelX, startPanelY, startPanelLeft, startPanelTop;
els.header.onmousedown = (e) => {
  if (e.target.id === "koact-close") return;
  isPanelDrag = true;
  startPanelX = e.clientX;
  startPanelY = e.clientY;
  const rect = els.panel.getBoundingClientRect();
  startPanelLeft = rect.left;
  startPanelTop = rect.top;
  els.header.style.cursor = "grabbing";
};

// 面板 Resize
let isResizing = false;
let startResizeX, startResizeY, startWidth, startHeight;
els.resize.onmousedown = (e) => {
  e.stopPropagation();
  isResizing = true;
  startResizeX = e.clientX;
  startResizeY = e.clientY;
  startWidth = els.panel.offsetWidth;
  startHeight = els.panel.offsetHeight;
};

// 画布平移
els.wrapper.onmousedown = (e) => {
  if (e.button !== 0) return;
  state.isPanning = true;
  state.lastX = e.clientX;
  state.lastY = e.clientY;
  els.wrapper.style.cursor = "grabbing";
};

// 画布缩放
els.wrapper.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    state.scale = Math.min(Math.max(0.1, state.scale + delta), 5);
    updateTransform();
  },
  { passive: false },
);

window.addEventListener("mousemove", (e) => {
  if (isPanelDrag) {
    els.panel.style.left = startPanelLeft + (e.clientX - startPanelX) + "px";
    els.panel.style.top = startPanelTop + (e.clientY - startPanelY) + "px";
  }
  if (isResizing) {
    els.panel.style.width =
      Math.max(300, startWidth + (e.clientX - startResizeX)) + "px";
    els.panel.style.height =
      Math.max(200, startHeight + (e.clientY - startResizeY)) + "px";
  }
  if (state.isPanning) {
    state.x += e.clientX - state.lastX;
    state.y += e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    updateTransform();
  }
});

window.addEventListener("mouseup", () => {
  isPanelDrag = false;
  isResizing = false;
  state.isPanning = false;
  els.header.style.cursor = "grab";
  els.wrapper.style.cursor = "default";
});

// 按钮事件
document.getElementById("btn-reset").onclick = () => {
  state.scale = 1;
  state.x = 0;
  state.y = 0;
  updateTransform();
};
document.getElementById("btn-zoom-in").onclick = () => {
  state.scale += 0.2;
  updateTransform();
};
document.getElementById("btn-zoom-out").onclick = () => {
  state.scale = Math.max(0.1, state.scale - 0.2);
  updateTransform();
};

fab.onclick = () => {
  store.isPanelVisible = !store.isPanelVisible;
  els.panel.style.display = store.isPanelVisible ? "flex" : "none";
  // 每次打开面板时，如果有数据且没渲染成功，尝试重新渲染
  if (store.isPanelVisible && store.lastFiberRoot) {
    renderMermaid(store.lastFiberRoot);
  }
};
document.getElementById("koact-close").onclick = () => {
  store.isPanelVisible = false;
  els.panel.style.display = "none";
};

// ==========================================
// 6. 渲染逻辑
// ==========================================
let timer = null;

window.__KOACT_DEVTOOLS_HOOK__ = {
  emit: (event, fiberRoot) => {
    if (event === "commit") {
      console.log("[DevTools] Commit received");
      // 1. 缓存数据 (关键！)
      store.lastFiberRoot = fiberRoot;

      // 2. 视觉反馈
      fab.style.backgroundColor = "#ff4757";
      setTimeout(() => (fab.style.backgroundColor = "#2c3e50"), 300);

      // 3. 尝试渲染
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        renderMermaid(fiberRoot);
      }, 100);
    }
  },
};

async function renderMermaid(fiberRoot) {
  // 检查库是否加载
  if (!store.isMermaidReady || !window.mermaid) {
    updateStatus("Loading Mermaid library...");
    return;
  }

  const classDefs = `
    classDef placement fill:#d4edda,stroke:#28a745,stroke-width:2px;
    classDef update fill:#fff3cd,stroke:#ffc107,stroke-width:2px;
    classDef deletion fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
    classDef default fill:#fff,stroke:#333,stroke-width:1px;
  `;

  const graphDefinition = `
    graph TD
    ${classDefs}
    ${generateMermaidGraph(fiberRoot)}
  `;

  try {
    updateStatus("Rendering...");
    mermaid.initialize({ startOnLoad: false, theme: "neutral" });

    // 生成 SVG
    const id = "koact-graph-" + Date.now();
    const { svg } = await mermaid.render(id, graphDefinition);

    // 放入容器
    els.container.innerHTML = svg;
    updateStatus(""); // 清空状态文字
  } catch (e) {
    console.error(e);
    updateStatus(`Render Error: ${e.message}`);
  }
}
