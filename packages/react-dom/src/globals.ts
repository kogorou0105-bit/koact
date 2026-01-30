// packages/react-dom/src/globals.ts
import { Fiber } from "./types";

export const Globals = {
  nextUnitOfWork: null as Fiber | null,
  currentRoot: null as Fiber | null,
  wipRoot: null as Fiber | null,
  deletions: [] as Fiber[],
  wipFiber: null as Fiber | null,
  hookIndex: 0,
};
