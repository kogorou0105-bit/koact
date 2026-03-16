// packages/react-dom/src/globals.ts
import { Fiber } from "./types";
import { Hook } from "./types";
export const Globals = {
  nextUnitOfWork: null as Fiber | null,
  currentRoot: null as Fiber | null,
  wipRoot: null as Fiber | null,
  deletions: [] as Fiber[],
  wipFiber: null as Fiber | null,
  // hookIndex: 0,
  workInProgressHook: null as Hook | null, // 当前正在构建的 Hook
  currentHook: null as Hook | null, //正在构建的hook的老fiber节点的hook
};
