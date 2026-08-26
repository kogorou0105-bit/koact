# Koact

Koact 是一个为了深入理解 React 原理而从 Didact 实现的 Mini-React 框架。它实现了 Fiber 架构、基于空闲时间的协作式调度以及 Hooks 系统。

通过 Koact，你可以直观地看到 React 内部是如何通过链表（Fiber）管理组件状态，以及如何通过时间切片（Time Slicing）来保持页面流畅的。

The project is for learning purposes only. 该项目仅以学习为目的。

## ✨ 特性 (Features)

- [x] **JSX Support**: 基于 Vite 和 Babel 的 JSX 解析
- [x] **Virtual DOM**: 虚拟 DOM 节点的创建与管理
- [x] **Functional Components**: 支持函数组件
- [x] **Fiber Architecture**: 基于链表的 Fiber 架构，支持任务中断与恢复
- [x] **Cooperative Scheduling**: 利用空闲回调和降级调度实现可中断的渲染阶段
- [x] **Reconciliation**:
  - [x] Diff 算法
  - [x] Keyed Diff (基于 Map 的节点复用)
  - [x] Deletion (节点卸载与清理)
- [x] **Hooks System**:
  - [x] `useState` (状态管理)
  - [x] `useEffect` (副作用处理，支持 Cleanup)
  - [x] `useMemo` & `useCallback` (性能优化)
  - [x] `useRef` (DOM 引用与持久化存储)
- [x] **Architecture**:
  - [x] Dispatcher Pattern (依赖倒置，实现核心包与渲染器解耦)
  - [x] Event-driven pattern. (事件驱动，关键节点设置探针向外暴露关键数据，并将数据处理交给外部插件)
- [x] **Plugin**:
  - [x] Fiber Tree visulization (Fiber树的可视化)

## 使用方式

```tsx
import React from "@koact/react";
import { createRoot } from "@koact/react-dom";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// 卸载时会清理 effects 和 refs
root.unmount();
```

原有的 `ReactDOM.render(element, container)` 仍然保留，并与 `createRoot`
共享同一套多 Root 调度实现。

```bash
pnpm check:core
pnpm --filter todo-app build
```

## 当前边界

Koact 目前面向现代浏览器 ESM 环境。`react-dom` 可以在没有 DOM 的环境中安全导入，
但尚未提供服务端渲染器。当前调度模型不包含 React 的 Lanes、Suspense、Transitions
或完整 Concurrent Rendering 语义。

后续的 UpdateQueue、自动批处理、Lanes、`startTransition` 和 Fiber Bailout 设计见
[现代更新机制实施计划](./docs/modern-react-roadmap.md)。

## 📦 架构设计 (Architecture)

Koact 采用了与 React 官方一致的 Monorepo 结构，通过依赖倒置原则（Dispatcher 模式）实现了核心逻辑与渲染实现的解耦。

### 1. @koact/react (Core)

#### 抽象层

- 定义组件标准（`createElement`, `Fragment`）。
- 定义 Hooks 的公开 API（`useState`, `useEffect`...）。
- 不包含具体逻辑，仅负责将调用转发给当前的 Dispatcher。
- **特点**：平台无关，可以在 Browser、Native 或 Server 端复用。

### 2. @koact/react-dom (Renderer)

#### 实现层

- 实现了 Scheduler（调度器）和 Reconciler（协调器）。
- 实现了具体的 Hooks 逻辑（操作 Fiber 链表）。
- 负责具体的 DOM 操作（增删改查）。
- **初始化时**：将自身的 Hooks 实现注入到 `@koact/react` 的 Dispatcher 中。

## 📚 灵感来源 (Inspiration)

特别致谢：

Didact by Rodrigo Pombo:

本项目早期的核心逻辑深受 Rodrigo Pombo 的 "Build your own React" 系列文章启发，Didact 是学习 Mini-React 最好的起点。

- 📝 **文章教程**: [Build your own React](https://pomb.us/build-your-own-react/)
- 📺 **视频教程**: [Build your own React (YouTube)](https://www.youtube.com/watch?v=GBe5VwmgA4Q)
- 📄 **仓库地址**: [Didact](https://github.com/pomber/didact)

React by Facebook (Meta):

React 官方源码提供了关于 Hooks 实现、Fiber 调度以及合成事件系统最权威的参考。
