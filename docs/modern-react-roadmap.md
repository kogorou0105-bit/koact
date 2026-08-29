# Koact 现代更新机制实施计划

状态：阶段 A 已完成，阶段 B 进行中，阶段 C 规划中
更新时间：2026-08-29

## 1. 背景

Koact 已经具备 Fiber 树、可中断 Render、统一 Commit、Hooks、多 Root、keyed
reconciliation、effect/ref 生命周期、环形 UpdateQueue 和自动批处理。当前更新系统仍有以下边界：

- `useState` 已支持 `DefaultLane/TransitionLane` 和 Rebase，单 Root 会分轮处理最高优先级 Lane。
- Root 会记录 Render 期间到达的 Lane：同优或更高优更新重启 WIP，低优更新继续等待。
- 同一 JavaScript 回调中的多次更新通过微任务合并 Root 调度。
- 每个函数组件都会重新执行，没有 `memo` 和基于子树优先级的 Bailout。

下一阶段将围绕一条完整链路改造：

```text
dispatch action
  -> enqueue circular update
  -> request update lane
  -> mark root/fiber lanes
  -> select next lanes
  -> interruptible render
  -> rebase skipped updates
  -> bailout unchanged subtrees
  -> commit completed lanes
```

本计划只覆盖以下三项：

1. 自动批处理与环形 UpdateQueue
2. Lanes 与 `startTransition`
3. `memo` 与 Fiber Bailout

## 2. 目标

- 一次同步任务中的多个更新只触发一次 Render/Commit，但 action 必须按顺序全部执行。
- 更新能够携带优先级，低优更新可以被跳过、保留并在之后正确重放。
- 高优更新能够中断尚未提交的低优 Render。
- `memo` 组件在 props 未变化且自身、子树都没有目标 Lane 时跳过执行。
- 所有行为都能通过确定性测试和调度事件验证，而不是依赖人工观察。
- 保持现有 `ReactDOM.render`、`createRoot`、Hooks 和 keyed DOM identity 行为。

## 3. 非目标

- 不实现完整 React Scheduler 包和浏览器任务优先级映射。
- 不实现 Suspense、Error Boundary、Offscreen、Hydration 或 Server Components。
- 不实现 Lane Entanglement、Expiration Time 和饥饿升级。
- 第一版不实现 `useTransition` 的 pending 状态，只提供 `startTransition`。
- 第一版不实现通用 `flushSync` 公共 API。

## 4. 实施顺序

三个能力存在明确依赖，必须按以下顺序落地：

| 阶段 | 状态 | 能力 | 依赖原因 |
| --- | --- | --- | --- |
| A | 已完成 | 环形 UpdateQueue + 自动批处理 | Lane 需要可跳过、可重放的更新队列 |
| B | 进行中 | Lanes + `startTransition` | Bailout 必须知道当前 Fiber 和子树是否有目标优先级 |
| C | 规划中 | `memo` + Fiber Bailout | 依赖 `lanes`、`childLanes` 和完整的子树克隆逻辑 |

每个阶段独立提交，只有当前阶段测试通过后才进入下一阶段。

## 5. 阶段 A：环形 UpdateQueue 与自动批处理（已完成）

### 5.1 数据结构

阶段 A 先创建 `packages/react-dom/src/lanes.ts`，只定义 `Lane`、`NoLane` 和
`DefaultLane`。阶段 B 再扩展完整优先级集合，避免 Update 数据结构二次迁移。

新增 `packages/react-dom/src/updateQueue.ts`，将 State Hook 的 action 数组替换为环形单链表：

```ts
interface Update<State> {
  lane: Lane;
  action: State | ((previousState: State) => State);
  next: Update<State>;
}

interface UpdateQueue<State> {
  pending: Update<State> | null;
  dispatch: Dispatch<State> | null;
  root: FiberRoot | null;
  fiber: Fiber | null;
}

interface StateHook<State> {
  tag: "STATE";
  memoizedState: State;
  baseState: State;
  baseQueue: Update<State> | null;
  queue: UpdateQueue<State>;
}
```

`queue.pending` 指向环形链表尾节点，`pending.next` 是首节点。插入复杂度保持 O(1)：

```ts
if (pending === null) {
  update.next = update;
} else {
  update.next = pending.next;
  pending.next = update;
}
queue.pending = update;
```

稳定 setter 通过共享 queue 定位更新目标。`queue.fiber` 必须始终指向最近一次成功
Commit 的 current Fiber：

- Mount Commit 后绑定到新 current Fiber。
- Update Commit 后从旧 current Fiber 切换到新 current Fiber。
- Render 中断时不改变 owner。
- Unmount 时同时清空 `queue.root` 和 `queue.fiber`。

阶段 B 的 `markUpdateLaneFromFiberToRoot` 从该 committed Fiber 开始向上冒泡，不能只保存
Root，否则无法维护祖先的 `childLanes`。

### 5.2 Render 阶段处理

Render 开始时将 `pendingQueue` 合并到 Hook 的 `baseQueue`，然后按入队顺序处理。

- `lane === NoLane` 或 Lane 在本轮 `renderLanes` 中：执行 action。
- 非 `NoLane` 且不在本轮 `renderLanes` 中：克隆到新的 `baseQueue`。
- 出现第一次跳过后，后续已执行更新也以 `NoLane` 克隆进 `baseQueue`。
- 只有 Commit 成功后，WIP Hook 的 `memoizedState/baseState/baseQueue` 才成为 current。
- Render 被中断或抛错时，current State 和共享 pending queue 不能丢失更新。

pending 合并协议必须显式实现：

1. Render 开始时快照 `queue.pending` 的尾节点。
2. 将快照环拼接到 WIP Hook 的 `baseQueue`。
3. 在清空 `queue.pending` 前，同步更新 current Hook 的 `baseQueue` 尾指针，确保中断后仍能找到已经合并的更新。
4. 合并期间新入队的更新形成新的 pending 环，不属于本轮快照。
5. WIP 被废弃时只丢弃计算结果，不删除 current base queue 或新 pending 环。

这里允许修改 current Hook 的队列链接元数据以保持更新可达，但不能提前修改 current
的 `memoizedState`。成功 Commit 后再用 WIP Hook 替换 current Hook。

需要用下面的顺序验证 Rebase：

```text
base state: 0
Default:    +1
Transition: *10
Default:    +1

Default render result: 2
remaining base queue: Transition(*10), NoLane(+1)
Transition render final result: 11
```

### 5.3 自动批处理

新增 `packages/react-dom/src/batching.ts`：

```ts
let batchDepth = 0;
const batchedRoots = new Set<FiberRoot>();

export function batchedUpdates<T>(scope: () => T): T;
```

规则：

- setter 始终立即入队并标记 Root，同一 JavaScript 回调中的更新共享 flush microtask。
- 最外层 `batchedUpdates` 结束时只安排 flush，不同步执行 Render。
- flush microtask 调用每个 Root 的 `flush`，再统一安排真正的 Host Callback。
- 同一个同步调用栈、Promise callback、timer callback 或原生事件 callback 中的更新会在该回调结束后的微任务统一安排。
- 如果宿主 Render 尚未开始，来自后续回调的工作可能继续合并；不承诺每个 macrotask 独立 Commit。
- 不合并 action，只合并 Render/Commit。
- 多 Root 可以共享批处理边界，但每个 Root 独立选择工作。

自动批处理必须在 scheduler 层成立，不能只包装 `dom.ts` 中由 Koact 注册的事件，否则
外部 `addEventListener`、Promise 和 timer 无法覆盖。`batchedUpdates` 保留给未来合成事件
系统和嵌套批处理使用；阶段 A 不替换 DOM listener，避免破坏 add/remove listener 的函数身份。

当前调度器已经通过 Set 对 Root 去重，但该行为只是隐式合并。改造后批处理边界、
flush microtask 和 Host Callback 的职责必须分开并可测试。

### 5.4 阶段 A 测试

新增 `packages/react-dom/src/__test__/updateQueue.test.ts`：

- 空队列和单节点环形队列。
- 多个 action 保持插入顺序。
- value action 与 functional action 混合。
- Rebase 时 `NoLane` 克隆更新始终执行。
- Render 中断后 action 不丢失、不重复。
- pending 环刚合并后立刻中断，下一轮仍能恢复全部更新。
- Yield 期间新入队的 action 留在新 pending 环，并在后续 Render 处理。
- Commit 成功后 pending 更新被正确消费。

扩展 `runtime.test.ts`：

- 一个事件中的三个 setter 只产生一次 Commit。
- 三个 functional update 得到累计结果，而不是最后一次覆盖。
- Promise 回调中的多个更新自动批处理。
- 前一次工作完成后，后续 task 的更新会产生新的 Commit。
- 同一批次中的两个 Root 各提交一次。

### 5.5 阶段 A 完成标准

- State Hook 不再使用 action 数组和 `processedCount`。
- 更新队列支持中断后的安全重放。
- 批处理测试能够断言 Render 次数和 Commit 次数。
- 当前 35 个核心测试全部通过，并由 CI 执行覆盖率门禁。

## 6. 阶段 B：Lanes 与 startTransition（进行中）

### 6.1 Lane 模型

实施状态：Lane 常量与纯位运算工具已完成。

扩展阶段 A 创建的 `packages/react-dom/src/lanes.ts`。第一版只保留能解释核心原理的最小集合：

```ts
export type Lane = number;
export type Lanes = number;

export const NoLane = 0b0000;
export const SyncLane = 0b0001;
export const DefaultLane = 0b0010;
export const TransitionLane = 0b0100;
```

同时提供纯函数：

```ts
mergeLanes(a, b)
removeLanes(set, subset)
includesSomeLane(a, b)
getHighestPriorityLane(lanes)
isHigherPriorityLane(a, b)
```

优先级顺序：`SyncLane > DefaultLane > TransitionLane`。

### 6.2 Root 与 Fiber 字段

实施状态：Root/Fiber Lane 字段、committed Fiber 到 Root 的 Lane 冒泡，以及本轮 Lane 的
Render/Commit 生命周期已完成。current/WIP 双向配对与按优先级调度尚未开始。

`FiberRoot` 增加：

```ts
pendingLanes: Lanes;
finishedLanes: Lanes;
renderLanes: Lanes;
callbackPriority: Lane;
```

`Fiber` 增加：

```ts
lanes: Lanes;
childLanes: Lanes;
```

State dispatch 时执行：

```text
requestUpdateLane
  -> enqueueUpdate(update, lane)
  -> markUpdateLaneFromFiberToRoot
  -> merge root.pendingLanes
  -> ensureRootIsScheduled
```

`markUpdateLaneFromFiberToRoot` 必须沿 parent 链更新祖先的 `childLanes`，否则 Memo 父组件会错误跳过有状态更新的后代。

dispatch 从 `queue.fiber` 获取 committed Fiber；Hook Render 期间共享 queue 仍然保留旧 owner，
只有 Commit 成功后才切换为新 Fiber，确保中断 WIP 不会成为调度入口。

为了处理 Yield 期间到达的新更新，current/WIP 在活跃 Render 内建立临时双向配对：

```text
workInProgress.alternate = current
current.alternate = workInProgress
```

`markUpdateLaneFromFiberToRoot` 先标记 committed Fiber 路径；如果该 Fiber 已经存在本轮 WIP
对应节点，再同步标记 WIP 路径。尚未创建 WIP 对应节点时，后续 `createWorkInProgress`
必须从 current 复制最新的 `lanes/childLanes`。Commit 或 Abort 后清除旧树反向链接，避免形成
历史链。

这条规则尤其用于“高优 Render 正在进行时，子组件收到低优更新”的场景。低优更新可以不打断
当前工作，但必须被带入即将提交的新 current 树，不能只存在于即将被替换的旧树。

### 6.3 startTransition

实施状态：`startTransition`、同步 Transition 上下文和 `requestUpdateLane` 已完成。更新能够
携带 `DefaultLane` 或 `TransitionLane`，显式 Root 更新保持 `SyncLane`；按 Lane 拆分 Render
和高优抢占仍属于下一阶段。

在 `@koact/react` 导出：

```ts
export function startTransition(scope: () => void): void;
```

`SharedInternals` 增加当前 Transition 标记：

```ts
SharedInternals.currentTransition
```

`startTransition` 在 `try/finally` 中设置和恢复标记。State dispatch 根据标记选择 Lane：

- Transition scope 内：`TransitionLane`
- 普通 setter：`DefaultLane`
- Root 初始挂载和显式同步入口：`SyncLane`

与 React 一致，第一版只标记 `scope` 同步执行期间产生的更新；`await` 后的更新需要新的 transition scope。
`root.render` 始终使用 `SyncLane`，不受 `startTransition` 影响；本阶段不引入 Root element
更新队列，连续显式 render 仍采用最后一次值覆盖前一次值的现有语义。

### 6.4 Lane 调度与抢占

实施状态：单个 Root 已能选择最高优先级 pending Lane 分轮 Render，并通过
`interleavedUpdatedLanes` 抢占低优 WIP 或继续当前高优 Render；`getNextRoot` 会跨 Root 选择
最高 pending Lane，并让同优 Root 按 FIFO 轮转。Host Callback 优先级尚未实现。

当前使用 Lane 判断活跃 WIP 的处理方式：

- 新 Lane 高于 `root.renderLanes`：废弃当前 WIP，先渲染高优更新。
- 新 Lane 等于当前 Lane：重新开始当前 Root，避免遗漏 Render 期间更新。
- 新 Lane 更低：保留为 `pendingLanes`，当前 Render 可以继续。
- Commit 后只移除 `finishedLanes`，被跳过的 Lane 继续留在 Root。

Host 调度策略：

- `SyncLane` 使用微任务尽快执行。
- `DefaultLane` 使用当前协作式 Host Callback。
- `TransitionLane` 使用可 Yield 的 Host Callback，并允许被前两者抢占。

Scheduler 增加全局 `hostCallbackPriority` 和 callback generation token。更高优先级工作到来时：

1. 取消尚未执行的低优 idle/timeout callback。
2. 增加 generation，使已经进入任务队列但无法取消的旧 callback 变成 no-op。
3. 按新的最高优先级重新安排 microtask 或 Host Callback。

如果已有低优 callback 时只依赖当前 `hostCallback !== null` 去重，高优更新虽然会排到队首，
但无法改善启动延迟，因此 callback 替换是 Lane 生效的必要条件。

每次 Host Callback 执行时使用 `getNextRoot()` 在所有 scheduled roots 中选择最高
`pendingLane` 的 Root。只有最高 Lane 相同的 Root 才按原入队顺序轮转，避免旧 Transition
Root 抢在后加入的 Sync Root 前执行，同时避免同优先级 Root 饥饿。

调度器必须继续保证多 Root 隔离和基本公平性。

### 6.5 Complete 阶段

当前遍历只实现 Begin Work。为了维护 `childLanes`，需要增加显式 Complete Work：

```ts
function completeWork(fiber: Fiber) {
  let childLanes = NoLane;
  let child = fiber.child;
  while (child) {
    childLanes = mergeLanes(childLanes, child.lanes);
    childLanes = mergeLanes(childLanes, child.childLanes);
    child = child.sibling;
  }
  fiber.childLanes = childLanes;
}
```

DFS 回溯时先执行 `completeWork`，再进入 sibling 或 parent。Commit 成功后清理本轮完成的 Fiber Lane。

### 6.6 阶段 B 调度事件

为了测试并服务后续 DevTools，事件总线增加：

```text
update-scheduled(root, lane)
render-start(root, lanes)
render-yield(root, lanes)
render-abort(root, oldLanes, nextLane)
commit(root, finishedLanes)
```

事件只描述已经发生的事实，监听器异常不得改变调度结果。

### 6.7 阶段 B 测试

`packages/react-dom/src/__test__/lanes.test.ts` 已覆盖 Lane 位运算；后续继续覆盖：

- Lane 合并、移除和最高优先级选择。
- Default Render 跳过 Transition update。
- 被跳过的 Transition update 最终正确 Rebase。
- Transition Render 被 Default update 打断。
- 高优 Render Yield 期间到达的低优子组件更新会同时标记 current/WIP，之后不会被 Memo 吞掉。
- 高优提交后低优 Lane 仍保留在 `pendingLanes`。
- 多 Root 队列中后加入的 Sync Root 先于旧 Transition Root 执行。
- 多 Root 各自选择最高优先级。
- 同优先级大 Root 不会饿死另一个 Root。

新增演示场景：

- 输入框更新使用 Default Lane。
- 5000 项列表过滤放入 `startTransition`。
- 受控 deadline 下可以观察到 Yield 和高优更新抢占。

### 6.8 阶段 B 完成标准

- 每个 update、Fiber 和 Root 都具有可追踪的 Lane。
- 高优更新能够中断低优 WIP，且不会丢失低优 action。
- `startTransition` API 可用于示例并具有确定性测试。
- 版本号只跟踪 Render 期间是否有更新和卸载完成状态，不再承担优先级判断。

## 7. 阶段 C：memo 与 Fiber Bailout

### 7.1 公共 API

在 `@koact/react` 中增加：

```ts
export function memo<Props>(
  component: FunctionComponent<Props>,
  compare?: (previous: Props, next: Props) => boolean,
): MemoComponent<Props>;
```

Memo 类型使用独立标记，避免和普通函数组件混淆：

```ts
const MEMO_TYPE = Symbol.for("koact.memo");

interface MemoComponent<Props> {
  $$typeof: typeof MEMO_TYPE;
  type: FunctionComponent<Props>;
  compare: ((previous: Props, next: Props) => boolean) | null;
}
```

阶段 C 先调整 Element 模型：

```ts
interface ReactElement {
  type: ElementType;
  key: Key | null;
  ref: Ref<unknown> | null;
  props: Record<string, unknown>;
}
```

- `ElementType` 显式加入 `MemoComponent` 对象类型。
- `createElement` 将 `key/ref` 提取到 Element 顶层，不再放入 props。
- Fiber 增加独立 `ref` 字段；Reconciliation 从 Element 复制 ref，并保留 alternate ref 用于比较。
- Commit、Deletion、两阶段 ref detach/attach 全部从 `fiber.ref` 读取，不再访问 `props.ref`。
- 没有 children 时不创建新的空数组；单 child 保持值，多 child 才创建数组。
- Reconciler 在消费 `props.children` 时统一调用 `normalizeChildren`。
- Reconciler 必须先识别 `$$typeof === MEMO_TYPE`，不能把 Memo 对象交给 Host 分支。

默认 comparator 对普通 props（包含真实 children）使用浅比较和 `Object.is`。不能简单忽略
children，否则 children 改变时会产生错误 Bailout；稳定的无 children 组件也不能因为每次
新建空数组而失去 Memo 效果。

### 7.2 Fiber Props 模型

Fiber 增加明确的 props 状态：

```ts
pendingProps: Props;
memoizedProps: Props | null;
```

- Reconciliation 写入 `pendingProps`。
- Commit 成功后更新 `memoizedProps`。
- Comparator 对比 current 的 `memoizedProps` 与 WIP 的 `pendingProps`。

保留现有 `props` 会让“待处理 props”和“已提交 props”语义混杂，因此阶段 C 应完成字段迁移，而不是继续增加条件判断。

### 7.3 Bailout 条件

Memo Bailout 分为两级。

跳过 Memo 组件函数执行需要：

```text
component type 相同
compare(previousProps, nextProps) === true
ref 未变化
fiber.lanes 与 renderLanes 无交集
本 Fiber 没有 Placement/Deletion 工作
```

如果 `childLanes` 与 `renderLanes` 有交集，只跳过 Memo 函数本身，然后克隆直接 child
并继续向下 Begin Work。如果没有交集，才允许跳过整棵子树。

必须明确：props 相同不能屏蔽组件自身的 State 更新；父组件函数被跳过也不能屏蔽子树中的目标 Lane。

### 7.4 子树复用

Bailout 不能直接把 current child 指针挂到 WIP，因为当前 Commit 会遍历并修改整棵 finished
tree，旧 parent 指针也会破坏后续 Lane 冒泡。新增两个明确路径：

```ts
function cloneChildFibers(current: Fiber, workInProgress: Fiber): void;
function cloneBailedOutSubtree(current: Fiber, workInProgress: Fiber): void;
```

- 子树仍有目标 Lane：只浅克隆直接 child/sibling，修正 parent，然后继续 Begin Work。
- 整棵子树无目标 Lane：递归克隆 Fiber 结构，修正所有 parent/sibling/alternate，但不执行组件函数或 Reconciliation。

递归结构克隆会保留 O(n) Fiber 分配成本，但能在不重写现有 Commit 的前提下保证 current/WIP
隔离，并显著减少组件执行和 Reconciliation。若后续要消除该分配，再单独引入双缓冲 Fiber、
subtree flags 和按 flags 提交，不能在本阶段直接深层复用 current 节点。

keyed move 与 Memo 同时发生时，DOM Placement 仍必须执行；Memo 只能跳过组件计算，不能吞掉父级 Reconciliation 产生的移动标记。

### 7.5 Complete 与 Commit

- Complete 阶段重新聚合 `childLanes`。
- Commit 后从 `lanes/childLanes` 中移除 `finishedLanes`。
- `memoizedProps` 只在成功 Commit 后更新。
- 中断的 WIP 不能污染 current Fiber 的 props 或 Lane。

Lane 清理必须发生在任何用户回调之前，Commit 顺序固定为：

```text
DOM mutations and deletion bookkeeping without user callbacks
  -> publish root.current
  -> rebind live update queues to committed fibers
  -> remove finishedLanes from root/fibers
  -> detach/attach refs
  -> destroy/create effects
  -> emit devtools commit event
```

删除阶段先收集待执行的 ref/effect cleanup，并将已删除 StateQueue 标记为 unmounted，但不能在
Lane 清理前调用用户函数。这样 ref callback 或 effect cleanup/setup 中产生的同 Lane 更新，会在
`finishedLanes` 移除之后重新合并到 Root，不会被本次 Commit 误删。

### 7.6 阶段 C 测试

新增 `packages/react-dom/src/__test__/memo.test.ts`：

- 默认浅比较跳过函数执行。
- 自定义 comparator 生效。
- 新对象 props 会触发更新。
- `Object.is(NaN, NaN)` 和 `Object.is(0, -0)` 语义正确。
- Memo 组件自身 setState 仍然重新渲染。
- Memo 父组件能够放行有目标 Lane 的子组件。
- 无目标 `childLanes` 时整棵子树跳过。
- Memo 组件 keyed 重排保留状态和 DOM identity。
- Render 中断时 `memoizedProps` 不提前更新。
- ref/effect 回调在 Commit 中调度同 Lane 更新时，该更新仍保留在 `pendingLanes`。

### 7.7 阶段 C 完成标准

- `memo` API、默认浅比较和自定义 comparator 可用。
- Bailout 统计能够证明组件执行次数和 Begin Work 节点数下降。
- 第一版重点统计组件执行数和 Begin Work 数；递归结构克隆成本单独记录。
- State、keyed movement、ref 和 child lanes 不会被错误跳过。
- 5000 项演示中，稳定子树的 Begin Work 数量有可重复的下降数据。

## 8. 文件改造清单

阶段 A 已新增：

```text
packages/react-dom/src/updateQueue.ts
packages/react-dom/src/batching.ts
packages/react-dom/src/lanes.ts
packages/react-dom/src/__test__/updateQueue.test.ts
packages/react-dom/src/__test__/batching.test.ts
```

阶段 B 已新增：

```text
packages/react-dom/src/__test__/lanes.test.ts
```

阶段 B/C 计划新增：

```text
packages/react-dom/src/__test__/memo.test.ts
examples/concurrent-lab/
```

阶段 A 已修改：

```text
packages/react-dom/src/types.ts
packages/react-dom/src/hooks.ts
packages/react-dom/src/scheduler.ts
packages/react-dom/src/commit.ts
packages/react-dom/src/__test__/runtime.test.ts
```

阶段 B/C 预计修改：

```text
packages/react/src/index.ts
packages/react/src/dispatcher.ts
packages/react-dom/src/types.ts
packages/react-dom/src/hooks.ts
packages/react-dom/src/scheduler.ts
packages/react-dom/src/reconciler.ts
packages/react-dom/src/commit.ts
packages/react-dom/src/dom.ts
packages/react-dom/src/events.ts
packages/vite-plugin-koact-devtools/client.js
```

## 9. 验证门槛

每个阶段都必须执行：

```bash
pnpm check
```

最终阶段额外要求：

- 所有旧回归测试保持通过。
- 新增更新队列、Lane、抢占和 Bailout 测试。
- 无固定 sleep，调度测试使用可控 deadline。
- Concurrent Lab 在 Chrome 中完成输入和列表交互冒烟测试。
- DevTools 事件可以还原一次 Transition 被高优更新打断的完整过程。

## 10. 建议提交拆分

```text
feat: add circular state update queues and batching
feat: add lane priorities and transitions
feat: add memo components and fiber bailouts
docs: explain concurrent update architecture
```

每个功能提交应同时包含实现、测试和对应文档更新，避免留下无法独立验证的中间状态。

## 11. 面试讲解主线

完成后应能用一个具体例子回答以下问题：

1. 为什么普通 action 数组不足以支持并发更新？
2. 为什么跳过低优更新后，还要克隆后续已执行更新？
3. Lane 如何从 Hook update 冒泡到 Root？
4. 高优更新到来时，为什么可以废弃 WIP 但不能删除 pending update？
5. `memo` 为什么不能只比较 props？
6. `childLanes` 如何避免父组件 Bailout 吞掉子组件更新？
7. Render 阶段可中断，而 Commit 阶段为什么必须保持同步？

项目价值不只在于实现 API，而在于能够通过代码、测试、事件时间线和性能数据证明上述语义。
