# Concurrent Lab Benchmark

该基准在真实 Chrome 中运行 `examples/concurrent-lab`，用于记录 5000 行 Transition Render
在 Default 更新干扰下的调度事件。Runner 固定使用 `memo=0` 保持 P1.5 基线负载；页面默认的
Memo 行用于 P2 Bailout 演示。该基准是回归证据，不是跨机器性能排名。

## 运行

`pnpm install` 会安装锁定版本的 `@playwright/cli`。本机安装 Chrome 后运行：

```bash
pnpm benchmark:concurrent
```

若本机没有 Chrome，可先运行 `pnpm exec playwright-cli install-browser chrome`。

默认结果写入 `benchmarks/results/concurrent-lab.latest.json`。可覆盖参数：

```bash
pnpm benchmark:concurrent -- \
  --warmup=2 \
  --samples=20 \
  --interrupt-delay=8 \
  --settle-delay=24 \
  --timeout=15000 \
  --port=5191 \
  --output=benchmarks/results/concurrent-lab.latest.json
```

## 固定负载

- Chrome headless，viewport 固定为 1280×720。
- 原始结果记录完整 Chrome UA、viewport、CPU、内存、操作系统、Node 和
  `playwright-cli` 版本。
- 5000 个 keyed 行，查询在 `record` 与空字符串间交替，两者都保留全部行。
- 调度基准通过 `memo=0` 使用原始 host-row Fiber 形状，报告参数会记录 `memoRows: false`。
- 每轮先安排 Control Root 的 Default 更新和 Catalog Root 的 Transition 更新。
- 观察到 Transition `render-start` 后 8ms，向 Catalog Root 注入一次 Default 更新。
- 默认预热 2 轮，再记录 20 轮；轮次串行执行。

## 指标

- `inputEnqueueToCommitMs`：Control Default 的 `update-scheduled` 到 `commit`。
- `transitionEnqueueToCommitMs`：Catalog Transition 的 `update-scheduled` 到 `commit`。
- `interactionToSettledMs`：发起样本到 Catalog 的 Default 与 Transition 均 Commit。
- `transitionRenderMs`：最终 Transition Render 从 `render-start` 到 `commit` 的墙钟时间。
- `preemptionLatencyMs`：Catalog Default 入队到 `higher-priority-update` Abort；若该轮
  Transition 已先完成则为 `null`。
- `renderAttempts` 记录 Catalog 每次 Render 的 Lane、结果、耗时、Yield 次数与 Begin Work
  Fiber 数；`renderCount`、`commitCount` 和 `processedFibers` 提供每轮汇总。
- 每轮验证最终 DOM 包含全部 5000 行；整次运行没有真实高优 Abort 时不会保存报告。

事件协议当前没有 update ID。基准通过“每轮只允许一个样本运行，等待两个 Lane 均 Commit 后
再开始下一轮”来关联事件，因此结果不应外推到并发交互的 update 级追踪。

## 结果解释

- 比较前应固定浏览器版本、机器、电源模式、viewport 和参数。
- 首次两轮只用于预热，不进入 summary。
- `elapsedTime` 是墙钟跨度，不等于纯 JavaScript CPU 时间。
- DevTools 面板保持关闭，避免 Mermaid 与时间线 DOM 更新污染测量。
- 原始 JSON 应与代码提交一起保存，不能只记录聚合值。

## 当前基线

2026-08-29 在 Headless Chrome 146、1280×720 viewport、Apple M5 Pro 上运行默认参数：

| 指标 | Median | P95 |
| --- | ---: | ---: |
| Input enqueue→commit | 0.2ms | 0.3ms |
| Transition enqueue→commit | 117.2ms | 149.8ms |
| Interaction→settled | 117.3ms | 149.8ms |
| Final Transition Render | 33.05ms | 43.9ms |
| Default schedule→Abort | 8.35ms | 52.8ms |
| Catalog Begin Work Fibers | 131,164.5 | 157,198 |

20 个 measured sample 共发生 42 次 Yield 和 20 次 `higher-priority-update` Abort；每轮均为
3 次 Catalog Render、2 次 Catalog Commit。完整逐轮数据见
[`results/concurrent-lab.latest.json`](./results/concurrent-lab.latest.json)。

## Memo Bailout 的确定性证据

`packages/react-dom/src/__test__/memo.test.ts` 使用同一棵 5000 行树比较稳定重渲染：普通行处理
15,003 个 Begin Work 单元并再次执行 5000 个行组件，Memo 行处理 5,003 个 Begin Work 单元且
不再执行行组件。该断言随 `pnpm check` 运行，不受机器计时噪声影响。由于完整 Bailout 仍需递归
克隆 Fiber，且 Commit 仍全树遍历，这组计数不等同于端到端耗时降低。
