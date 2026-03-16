import type { ReactElement } from "@koact/react";

export interface Fiber {
  type?: string | Function | symbol;
  props: {
    children: ReactElement[];
    [key: string]: any;
  };
  dom?: HTMLElement | Text | null;
  parent?: Fiber;
  child?: Fiber;
  sibling?: Fiber;
  alternate?: Fiber | null; // 指向上一棵树对应的 Fiber (用于 Diff)
  effectTag?: "PLACEMENT" | "UPDATE" | "DELETION";
  key?: null | string | number;
  memoizedState?: Hook | null;
}

export interface Hook {
  tag: "STATE" | "EFFECT" | "MEMO" | "REF"; // 区分 Hook 类型
  // for useState
  state?: any;
  queue?: any[];
  // for useEffect
  callback?: () => void | (() => void);
  deps?: any[];
  cleanup?: (() => void) | void;
  hasChanged?: boolean; // 标记本次是否需要执行
  next?: Hook | null;
}
