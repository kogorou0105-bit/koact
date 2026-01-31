# Koact

Koact 是一个为了深入理解 React 原理而从零实现的 Mini-React 框架。它不仅实现了 React 的核心 API，还完整复刻了 React 16+ 的 Fiber 架构、Concurrent Mode（并发模式）以及 Hooks 系统。

通过 Koact，你可以直观地看到 React 内部是如何通过链表（Fiber）管理组件状态，以及如何通过时间切片（Time Slicing）来保持页面流畅的。

## ✨ 特性 (Features)

- [x] **JSX Support**: 基于 Vite 和 Babel 的 JSX 解析
- [x] **Virtual DOM**: 虚拟 DOM 节点的创建与管理
- [x] **Functional Components**: 支持函数组件
- [x] **Fiber Architecture**: 基于链表的 Fiber 架构，支持任务中断与恢复
- [x] **Concurrent Mode**: 利用 `requestIdleCallback` 实现时间切片，不阻塞主线程
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
