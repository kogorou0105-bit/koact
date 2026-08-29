# Concurrent Lab Benchmark

该基准在真实 Chrome 中运行 `examples/concurrent-lab`，用于记录 5000 行 Transition Render
在 Default 更新干扰下的调度事件。它是回归证据，不是跨机器性能排名。

## 运行

要求本机已安装 Chrome 和 `playwright-cli`：

```bash
pnpm benchmark:concurrent
```

默认结果写入 `benchmarks/results/concurrent-lab.latest.json`。可覆盖参数：

```bash
pnpm benchmark:concurrent -- \
  --warmup=2 \
  --samples=10 \
  --interrupt-delay=8 \
  --settle-delay=24 \
  --timeout=15000 \
  --port=5191 \
  --output=benchmarks/results/concurrent-lab.latest.json
```

## 固定负载

- Chrome headless，默认 viewport 由 `playwright-cli` 提供。
- 原始结果记录完整 Chrome UA、viewport、CPU、内存、操作系统、Node 和
  `playwright-cli` 版本。
- 5000 个 keyed 行，查询在 `record` 与空字符串间交替，两者都保留全部行。
- 每轮先安排 Control Root 的 Default 更新和 Catalog Root 的 Transition 更新。
- 观察到 Transition `render-start` 后 8ms，向 Catalog Root 注入一次 Default 更新。
- 默认预热 2 轮，再记录 10 轮；轮次串行执行。

## 指标

- `inputEnqueueToCommitMs`：Control Default 的 `update-scheduled` 到 `commit`。
- `transitionEnqueueToCommitMs`：Catalog Transition 的 `update-scheduled` 到 `commit`。
- `interactionToSettledMs`：发起样本到 Catalog 的 Default 与 Transition 均 Commit。
- `transitionRenderMs`：最终 Transition Render 从 `render-start` 到 `commit` 的墙钟时间。
- `preemptionLatencyMs`：Catalog Default 入队到 `higher-priority-update` Abort；若该轮
  Transition 已先完成则为 `null`。
- `renderAttempts` 记录 Catalog 每次 Render 的 Lane、结果、耗时、Yield 次数与 Begin Work
  Fiber 数；`renderCount`、`commitCount` 和 `processedFibers` 提供每轮汇总。

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
| Transition enqueue→commit | 121.5ms | 134.2ms |
| Interaction→settled | 121.5ms | 134.3ms |
| Final Transition Render | 32.05ms | 48.2ms |
| Default schedule→Abort | 8.4ms | 9.3ms |
| Catalog Begin Work Fibers | 127,148.5 | 133,339 |

10 个 measured sample 共发生 26 次 Yield 和 10 次 `higher-priority-update` Abort；每轮均为
3 次 Catalog Render、2 次 Catalog Commit。完整逐轮数据见
[`results/concurrent-lab.latest.json`](./results/concurrent-lab.latest.json)。
