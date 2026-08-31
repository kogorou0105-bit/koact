# Koact 项目路线图

状态：P0、P1、P1.5、P2、P2.5 已完成，P3 待开始

更新时间：2026-08-30

## 1. 目标

本路线图用于按阶段推进 Koact，优先选择同时具备以下价值的工作：

- 能解释 React Runtime 的核心机制，而不是单纯增加 API 数量。
- 能通过确定性测试证明正确性。
- 能通过事件、计数或性能数据展示效果。
- 每个阶段可以独立完成、验证和提交。

Lanes、Update Rebase 和 Fiber Bailout 的底层设计见[现代更新机制实施计划](./modern-react-roadmap.md)。本文件只维护实施顺序、交付物和验收状态。

## 2. 总览

| 阶段 | 状态 | 主题 | 核心交付物 |
| --- | --- | --- | --- |
| P0 | 已完成 | 更新基础与工程门禁 | UpdateQueue、自动批处理、CI、覆盖率、架构文档 |
| P1 | 已完成 | 并发调度核心 | Lanes、`startTransition`、抢占、Rebase |
| P1.5 | 已完成 | 可观测性与性能证据 | 调度时间线、Concurrent Lab、Benchmark |
| P2 | 已完成 | 渲染 Bailout | `memo`、`childLanes`、Fiber Bailout |
| P2.5 | 已完成 | Commit 安全与可维护性 | 失败重试、Scheduler 模块化、测试拆分 |
| P3 | 待开始 | 事件系统 | Root 事件委托、捕获/冒泡、批处理边界 |

任何阶段只有在实现、测试、文档和 `pnpm check` 全部完成后，才能标记为已完成。

## 3. P0：更新基础与工程门禁

状态：已完成

### 实现

- [x] 使用环形 UpdateQueue 替换 state action 数组。
- [x] 支持 value action、functional action 和按入队顺序处理。
- [x] 支持跳过更新后的 `baseState/baseQueue` Rebase 基础。
- [x] 使用微任务合并同一 JavaScript 回调中的 Root 调度。
- [x] 在 Commit 后将共享 StateQueue 重新绑定到最新 current Fiber。
- [x] 在卸载时使旧 setter 失效并清理 pending queue。

### 质量证据

- [x] 5 个测试文件、35 个测试通过。
- [x] 覆盖异常 Render 后更新重放、过期 WIP、多 Root 和批处理中卸载。
- [x] 建立 statements 85%、branches 80%、functions 90%、lines 85% 的覆盖率门槛。
- [x] GitHub Actions 执行类型检查、覆盖率测试、Todo lint 和全部示例构建。
- [x] README 与技术路线图同步到当前实现。

## 4. P1：Lanes 与 Transition

状态：已完成（2026-08-29）

### 目标

将当前“所有更新同优先级、任意新更新使 WIP 失效”的模型，升级为可解释的最小多优先级调度模型。

### 实现清单

- [x] 增加 `SyncLane`、`DefaultLane`、`TransitionLane` 与 Lane 位运算工具。
- [x] 为 Fiber 增加 `lanes/childLanes`。
- [x] 为 FiberRoot 增加 `pendingLanes/renderLanes/finishedLanes/interleavedUpdatedLanes/callbackPriority`。
- [x] 实现 `requestUpdateLane`，让每个 StateUpdate 在入队时确定优先级。
- [x] 实现 `markUpdateLaneFromFiberToRoot`，沿 parent 路径冒泡子树优先级。
- [x] 在 `@koact/react` 导出 `startTransition`，并通过共享内部状态选择 `TransitionLane`。
- [x] 让 UpdateQueue 按 `renderLanes` 跳过低优更新，并正确保留和重放 base queue。
- [x] 调度器在单个 Root 内每轮只选择最高优先级 Lane。
- [x] 调度器跨 Root 按最高优先级选择，而不是只按 FIFO 执行。
- [x] 高优更新到来时中断低优 WIP，同时保留未完成的低优更新。
- [x] 按最高 pending Lane 安排并替换 Host Callback，Sync 工作使用微任务启动。
- [x] 增加 Complete 阶段，向上聚合 `childLanes`。
- [x] Commit 后只移除本轮完成的 Lane，保留其他 pending work。

### 必测场景

- [x] Lane 合并、移除、包含判断和最高优先级选择。
- [x] Default Render 跳过 Transition update。
- [x] `Default +1 → Transition *10 → Default +1` 最终从 `2` Rebase 为 `11`。
- [x] Transition Render 被 Default update 打断，低优 action 不丢失、不重复。
- [x] Render Yield 期间进入的新更新不会因为 current/WIP 切换而丢失。
- [x] 高优 Commit 后，低优 Lane 仍保留在 `pendingLanes`。
- [x] 删除唯一携带低优更新的子树后，不保留孤立 Lane 或产生空转 Commit。
- [x] 后加入的 Sync Root 能先于旧 Transition Root 执行。
- [x] 同优先级的多个 Root 不会互相饿死。

### 完成标准

- [x] 每个 Update、Fiber 和 Root 的 Lane 都可以被测试读取和断言。
- [x] `startTransition` 有公开 API、类型声明和使用示例。
- [x] 调度测试使用可控 deadline，不依赖固定 sleep。
- [x] 原有批处理、Hooks、Keyed Diff、ref/effect 和卸载测试全部保持通过。
- [x] `pnpm check` 通过，覆盖率不低于仓库门槛。

### 建议提交拆分

```text
feat: add lane model and fiber lane propagation
feat: add transition updates and lane-aware queues
feat: preempt lower-priority renders
test: cover lane scheduling and update rebasing
docs: document concurrent scheduling semantics
```

## 5. P1.5：调度可观测性与性能证据

状态：已完成（2026-08-29）

### 实现清单

- [x] 增加 `update-scheduled`、`render-start`、`render-yield`、`render-abort` 和 `commit` 事件。
- [x] 事件包含 Root 标识、Lane、时间戳和本轮处理 Fiber 数量。
- [x] 保证 DevTools 监听器异常不会影响调度和 Commit。
- [x] 将现有 Fiber 树面板升级为调度时间线，并保留历史 Commit 树快照回看。
- [x] 展示每次更新的 Lane、Yield、Abort、Commit、耗时和处理 Fiber 数量。
- [x] 新增 `examples/concurrent-lab`，使用 5000 项列表演示输入更新、Transition 过滤与高优抢占。
- [x] 建立可重复 Benchmark，保存运行参数和原始结果。

### 建议指标

- [x] 输入更新从 enqueue 到 Commit 的 median/p95 延迟。
- [x] 每轮 Render 的 Begin Work 节点数、Yield 次数和 Abort 次数。
- [x] 同一交互中的 Render/Commit 次数。
- [x] 高优更新到达后，Transition WIP 被抢占所需时间。
- [x] 固定浏览器版本、机器信息、列表规模、预热次数和采样轮数。

### 完成标准

- [x] DevTools 可以还原一次 `schedule → yield → abort → commit` 完整链路。
- [x] Concurrent Lab 不使用固定 500ms busy loop 伪造性能差异。
- [x] Benchmark 可通过脚本重复执行，而不是只保留截图。
- [x] README 只展示真实测量结果，不填写推测数据。

### 建议提交拆分

```text
feat: emit scheduler lifecycle events
feat: visualize lane scheduling timeline
feat: add concurrent rendering lab
perf: add reproducible scheduler benchmarks
```

## 6. P2：memo 与 Fiber Bailout

状态：已完成（2026-08-30）

### 实现清单

- [x] 在 `@koact/react` 增加 `memo` 与可选 comparator。
- [x] 将 `key/ref` 从 props 中提取到 Element/Fiber 顶层。
- [x] 将 Fiber props 拆分为 `pendingProps/memoizedProps`。
- [x] 默认 comparator 使用浅比较和 `Object.is`。
- [x] props 未变化且本 Fiber 无目标 Lane 时跳过组件函数执行。
- [x] `childLanes` 命中时跳过父组件函数，但继续处理有更新的子树。
- [x] 无目标 `childLanes` 时克隆稳定子树，不执行组件函数或 Reconciliation。
- [x] Commit 后清理已完成 Lane，并保持 current/WIP 隔离。

### 必测场景

- [x] 默认浅比较和自定义 comparator。
- [x] `Object.is(NaN, NaN)` 与 `Object.is(0, -0)` 语义。
- [x] Memo 组件自身 state 更新仍然生效。
- [x] Memo 父组件不会吞掉子组件更新，且未命中的兄弟节点不会重新执行。
- [x] Keyed 重排时状态和 DOM identity 保持不变。
- [x] Render 中断时 `memoizedProps` 不会提前发布。
- [x] ref/effect 回调中产生的同 Lane 更新不会被 Commit 清理掉。

### 完成标准

- [x] 记录优化前后的组件执行次数和 Begin Work 节点数。
- [x] 5000 项场景中，稳定更新的 Begin Work 从 15,003 降至 5,003，行组件执行从 5,000 降至 0。
- [x] 正确性测试、覆盖率门槛和全部示例构建同时通过。

完整 Bailout 当前通过递归克隆 Fiber 结构保持 current/WIP 隔离，因此 Fiber 分配和 Commit 遍历
仍是 O(n)；本阶段验证的是组件执行和 Reconciliation 工作量下降，不将其表述为常数级更新。

## 7. P2.5：Commit 安全与可维护性

状态：已完成（2026-08-30）

### 实现清单

- [x] 宿主 mutation 失败时不发布 `root.current`、不消费 Lane，也不执行 ref/effect。
- [x] 所有宿主 mutation 成功后才解绑被删除子树的 StateQueue。
- [x] 保留失败 Lane，并允许通过后续 `root.render` 或重复 `root.unmount` 显式重试。
- [x] 将 Host Callback、Root 调度队列和 Render Stack 从 Scheduler 门面中拆分。
- [x] 抽取 Commit 与 Scheduler 共用的错误上报函数。
- [x] 将单个 Runtime 大测试文件拆为 state、lanes、batching、concurrency、reconciliation 和 errors 六个领域套件。
- [x] 抽取 fake timers、Root reset 和可控 Idle Callback 的共享测试工具。

### 完成标准

- [x] Scheduler 门面从 444 行降至 263 行，公共导出保持不变。
- [x] 16 个测试文件、86 个测试通过。
- [x] Statements 93.15%、Branches 85.99%、Functions 97.61%、Lines 94.72%。
- [x] `pnpm check` 和全部示例构建通过。

## 8. P3：Root 事件系统

状态：待开始，依赖 P1

### 实现清单

- [ ] 将逐节点监听改为 Root 级事件委托。
- [ ] 从 event target 沿 Fiber/DOM 路径收集捕获和冒泡监听器。
- [ ] 支持 `onClick/onClickCapture` 等命名约定。
- [ ] 正确维护 `currentTarget`、`stopPropagation` 和监听器执行顺序。
- [ ] 更新 props 时替换处理函数，卸载时不保留失效引用。
- [ ] 将事件分发接入 `batchedUpdates`。
- [ ] 保持多个 Root 的事件边界隔离。

### 必测场景

- [ ] 捕获阶段从外到内、冒泡阶段从内到外。
- [ ] `stopPropagation` 阻止后续传播。
- [ ] 更新事件处理函数后只调用最新版本。
- [ ] 多个 Root 和嵌套 Root 不串事件。
- [ ] 一次事件中的多个 setter 只产生一次有效 Commit。
- [ ] 卸载后 Root listener 和组件引用可以释放。

### 完成标准

- [ ] 同类事件每个 Root 只注册固定数量的原生监听器。
- [ ] 事件顺序、传播停止、更新和卸载均有确定性测试。
- [ ] DevTools 能将事件来源与后续调度记录关联起来。

## 9. 暂缓范围

完成 P3 前，不优先投入以下方向：

- Suspense、Server Components、SSR 和 Hydration。
- Class Component、Router、状态库和大量补充 Hooks。
- 完整 React Scheduler、Lane Entanglement 和饥饿升级。
- 继续扩展 mini-vite、HMR 或依赖预构建。
- 以部署或页面视觉包装替代 Runtime 正确性与性能证据。

## 10. 执行约定

每次只推进一个可独立验收的条目：

1. 开始前将对应条目标记为进行中，并确认依赖已经完成。
2. 先补确定性测试或明确可观察结果，再实现最小正确改动。
3. 不为了兼容未来设计提前保留未使用 API。
4. 运行 `pnpm check`，记录测试数量、覆盖率和必要的性能数据。
5. 同步 README、技术设计和本路线图状态。
6. 每个提交只包含一个可解释的能力及其测试。
