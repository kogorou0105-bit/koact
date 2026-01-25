# Koact 项目实现进度与规划文档

## 1. 项目概述

**Koact** 是一个基于 Fiber 架构的 React 最小化实现。目前已经完成了核心的并发模式（Concurrent Mode）基础、Fiber 树的构建与更新循环、以及基础的 Hooks 支持。能够运行简单的计数器或 Todo List 应用。Vm

## 2. 当前进度 (Current Progress)

### ✅ 核心架构 (Core Architecture)

- [x] **JSX 转换**: 实现了 `createElement`，支持将 JSX 编译为虚拟 DOM 对象（VNode）。
- 支持 `TEXT_ELEMENT` 文本节点处理。
- 支持 `children` 数组扁PJ平化处理。

- [x] **Fiber 架构**: 实现了链表结构的 Fiber Tree。
- 包含 `child` (子), `parent` (父), `sibling` (兄弟) 指针。
- 包含 `alternate` 指针（用于双缓存机制/Diff 对比）。
- 包含 `stateNode` / `dom` (真实 DOM 映射)。

### ✅ 调度器与渲染 (Scheduler & Renderer)

- [x] **并发模式基础 (Time Slicing)**:
- 使用 `requestIdleCallback` 实现任务切片。
- 实现了 `workLoop` 工作循环，支持任务中断和恢复。

- [x] **Render 阶段**:
- 实现了 `performUnitOfWork` 进行深度优先遍历构建 Fiber 树。
- 区分了 `FunctionComponent` 和 `HostComponent` 的处理逻辑。

- [x] **Commit 阶段**:
- 实现了同步的 `commitRoot`。
- 支持 DOM 的 `PLACEMENT` (挂载)、`UPDATE` (更新)、`DELETION` (删除)。

- [x] **Reconciliation (Diff 算法)**:
- 实现了单层级的 Diff 对比（`reconcileChildren`）。
- 支持对比新旧 Fiber 的 `type` 来决定复用、新增或删除。

### ✅ 组件与 Hooks (Components & Hooks)

- [x] **函数组件 (Function Component)**:
- 支持函数组件的渲染与执行。

- [x] **useState Hook**:
- 实现了最基础的状态管理。
- 支持多个 `useState` 并存（通过 `hookIndex` 维护）。
- 支持函数式更新 `setState(c => c + 1)`。
- 触发更新时会自动重置 `wipRoot` 并启动新的渲染循环。

### ✅ DOM 操作

- [x] **属性更新**: 支持 `id`, `class` 等常规属性。
- [x] **事件绑定**: 支持 `onClick`, `onInput` 等事件监听（自动处理 `add/removeEventListener`）。
- [x] **样式处理**: 支持 `style` 对象及字符串写法。

---

## 3. 待办目标 (Roadmap / To-Do)

为了让 Koact 更接近真实的 React，以下功能是接下来的开发重点：

### 🚧 关键缺失功能 (High Priority)

- [ ] **useEffect Hook**:
- 目前仅实现了 `useState`。需要实现 `useEffect` 来处理副作用（在 Commit 阶段执行）。
- 需要支持依赖项数组（Dependency Array）对比。
- 需要支持 cleanup 函数（组件卸载或更新前执行）。

- [ ] **Keyed Diff (基于 Key 的调和)**:
- **现状**: 目前 Diff 算法是基于索引（index）线性对比的。
- **目标**: 实现 Map 结构，利用 `key` 属性来复用节点，解决列表乱序、插入时的性能问题和状态丢失问题。

- [ ] **Fragment 支持**:
- 虽然 `createElement` 做了扁平化，但 Fiber 层需要显式处理 `<Fragment>` 或 `<>`，避免在 DOM 树中引入多余的节点。

### 🔨 进阶功能 (Medium Priority)

- [ ] **Synthetic Event (合成事件)**:
- **现状**: 直接绑定原生事件到 DOM 上。
- **目标**: 实现事件代理（Event Delegation），将事件统一绑定到 `root`，并实现 React 的合成事件对象（SyntheticEvent），优化性能并抹平浏览器差异。

- [ ] **useMemo & useCallback**:
- 实现基于依赖项的缓存优化 Hooks。

- [ ] **useRef**:
- 实现 `ref` 对象，并在 Commit 阶段将 DOM 实例赋值给 `ref.current`。

- [ ] **Scheduler 优化**:
- `requestIdleCallback` 在实际浏览器中帧率不稳定且兼容性有限。React 使用了 `Scheduler` 包（基于 `MessageChannel`）来实现更精准的调度。

### 🧊 完善与生态 (Low Priority)

- [ ] **Context API**: 实现 `createContext`, `useContext` 及 `Provider`，用于跨层级传递数据。
- [ ] **Class Component**: 虽然现代 React 推崇函数组件，但完整的 React 实现通常包含类组件支持（处理 `this`, `lifecycle` 等）。
- [ ] **同步模式与高优先级打断**: 目前所有更新优先级相同。
