import { useState, useEffect, useMemo, useCallback } from "./hooks";
import { render } from "./scheduler";

export { useState, useEffect, useMemo, useCallback };

const ReactDOM = {
  render,
  useState,
  useEffect,
  useMemo,
  useCallback,
};

export default ReactDOM;

// --- 2. 全局变量 ---

// let Globals.nextUnitOfWork: Fiber | null = null;
// let Globals.currentRoot: Fiber | null = null;
// let Globals.wipRoot: Fiber | null = null;
// let Globals.deletions: Fiber[] = [];

// let Globals.wipFiber: Fiber | null = null;
// let Globals.hookIndex: number = 0;

// --- 3. DOM 操作相关 ---

// function createDom(fiber: Fiber): HTMLElement | Text {
//   const dom =
//     fiber.type === "TEXT_ELEMENT"
//       ? document.createTextNode("")
//       : document.createElement(fiber.type as string);

//   updateDom(dom, {}, fiber.props);

//   return dom;
// }

// const isEvent = (key: string) => key.startsWith("on");
// const isProperty = (key: string) => key !== "children" && !isEvent(key);
// const isNew = (prev: any, next: any) => (key: string) =>
//   prev[key] !== next[key];
// const isGone = (next: any) => (key: string) => !(key in next);

// function updateDom(dom: HTMLElement | Text, prevProps: any, nextProps: any) {
//   // 1. 移除旧的或变化的事件监听
//   Object.keys(prevProps)
//     .filter(isEvent)
//     .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
//     .forEach((name) => {
//       const eventType = name.toLowerCase().substring(2);
//       dom.removeEventListener(eventType, prevProps[name]);
//     });

//   // 2. 移除旧属性
//   Object.keys(prevProps)
//     .filter(isProperty)
//     .filter(isGone(nextProps))
//     .forEach((name) => {
//       (dom as any)[name] = "";
//     });

//   // 3. 设置新属性或变化的属性
//   Object.keys(nextProps)
//     .filter(isProperty)
//     .filter(isNew(prevProps, nextProps))
//     .forEach((name) => {
//       if (name === "style") {
//         const style = nextProps[name];

//         // 如果是 React 标准的对象写法 {{ color: 'red' }}
//         if (typeof style === "object" && style !== null) {
//           Object.keys(style).forEach((key) => {
//             // 需要转义类型，因为 dom.style 索引签名比较严格
//             (dom as HTMLElement).style[key as any] = style[key];
//           });
//         }
//         // 兼容字符串写法 (虽然 TS 会报错，但防守性编程可以留着)
//         else if (typeof style === "string") {
//           (dom as HTMLElement).style.cssText = style;
//         }
//       } else {
//         (dom as any)[name] = nextProps[name];
//       }
//     });

//   // 4. 添加新事件
//   Object.keys(nextProps)
//     .filter(isEvent)
//     .filter(isNew(prevProps, nextProps))
//     .forEach((name) => {
//       const eventType = name.toLowerCase().substring(2);
//       dom.addEventListener(eventType, nextProps[name]);
//     });
// }

// --- 4. Commit 阶段 (同步执行 DOM 修改) ---

// function commitRoot() {
//   Globals.deletions.forEach(commitWork);
//   if (Globals.wipRoot && Globals.wipRoot.child) {
//     commitWork(Globals.wipRoot.child);
//   }

//   if (Globals.wipRoot) {
//     commitEffects(Globals.wipRoot);
//   }
//   Globals.currentRoot = Globals.wipRoot;
//   Globals.wipRoot = null;
// }

// // 递归遍历执行 Effect
// function commitEffects(fiber: Fiber | null) {
//   if (!fiber) return;

//   // 1. 先遍历子节点 (深入)
//   let child = fiber.child;
//   while (child) {
//     commitEffects(child); // 递归处理子树
//     child = child.sibling; // 处理下一个兄弟
//   }

//   // 2. 子节点都处理完了，处理自己 (回溯/冒泡)
//   if (fiber.hooks) {
//     fiber.hooks.forEach((hook) => {
//       if (hook.tag === "EFFECT" && hook.hasChanged) {
//         if (hook.cleanup) hook.cleanup();
//         const cleanup = hook.callback!();
//         if (typeof cleanup === "function") hook.cleanup = cleanup;
//       }
//     });
//   }
// }
// function commitWork(fiber?: Fiber) {
//   if (!fiber) {
//     return;
//   }

//   // 向上查找最近的有 DOM 节点的父 Fiber
//   let domParentFiber = fiber.parent;
//   while (!domParentFiber || !domParentFiber.dom) {
//     domParentFiber = domParentFiber?.parent;
//   }
//   const domParent = domParentFiber.dom;

//   if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
//     domParent.appendChild(fiber.dom);
//   } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
//     updateDom(fiber.dom, fiber.alternate?.props || {}, fiber.props);
//   } else if (fiber.effectTag === "DELETION") {
//     commitDeletion(fiber, domParent);
//     // 删除节点后，不需要继续处理它的子节点 (因为已经从 DOM 移除)
//     return;
//   }

//   commitWork(fiber.child);
//   commitWork(fiber.sibling);
// }

// // function commitDeletion(fiber: Fiber, domParent: HTMLElement | Text) {
// //   if (fiber.dom) {
// //     domParent.removeChild(fiber.dom);
// //   } else {
// //     // 如果当前 Fiber 是函数组件（没有 DOM），则递归删子节点
// //     if (fiber.child) {
// //       commitDeletion(fiber.child, domParent);
// //     }
// //   }
// // }

// // 专门处理删除：既要删 DOM，又要执行 Cleanup
// function commitDeletion(fiber: Fiber, domParent?: HTMLElement | Text) {
//   if (!domParent) {
//     // 查找最近的 DOM 父节点
//     let parent = fiber.parent;
//     while (parent && !parent.dom) {
//       parent = parent.parent;
//     }
//     if (parent && parent.dom) domParent = parent.dom;
//   }

//   // 1. 如果当前节点有 DOM，移除它
//   if (fiber.dom && domParent) {
//     domParent.removeChild(fiber.dom);
//   }

//   // 2. 【关键】递归执行被删除子树中所有组件的 cleanup
//   // 即使当前 fiber 是 DOM 节点，它的子组件可能有 Effect 需要清理
//   cleanupHooks(fiber);

//   // 3. 如果当前节点没有 DOM (是函数组件)，需要继续向下找 DOM 来删除
//   // 注意：如果上面 fiber.dom 存在，domParent.removeChild 会自动移除所有子 DOM，
//   // 但我们仍需递归 cleanupHooks。
//   // 如果 fiber.dom 不存在，我们需要递归找到真实的 DOM 节点去移除。
//   if (!fiber.dom && fiber.child) {
//     // 简单处理：对于 FunctionComponent，我们只需递归清理 hooks，
//     // 真实的 DOM 删除会由有 dom 的子节点处理 (有点绕，这里简化逻辑：)
//     // 在简单实现中，通常找到第一个有 dom 的节点删掉即可。
//     // 这里为了代码简单，我们假设上面的 .removeChild 已经搞定了 DOM 结构，
//     // 下面只专注 cleanup。
//     // 但对于 Fragment 或 FC，我们需要确保 DOM 真的被移除了。

//     // 修正逻辑：
//     // 如果当前 fiber 没有 dom，说明它是 FC，我们需要对它的 child 执行 DOM 删除
//     if (fiber.child) {
//       commitDeletion(fiber.child, domParent);
//     }
//   }
// }

// // 递归清理 Effect
// function cleanupHooks(fiber: Fiber | null) {
//   if (!fiber) return;

//   if (fiber.hooks) {
//     fiber.hooks.forEach((h) => {
//       if (h.tag === "EFFECT" && h.cleanup) {
//         h.cleanup();
//       }
//     });
//   }

//   // 继续递归清理子树
//   cleanupHooks(fiber.child || null);
//   cleanupHooks(fiber.sibling || null);
// }

// // --- 5. Render 阶段 (可中断的递归) ---

// function workLoop(deadline: IdleDeadline) {
//   let shouldYield = false;
//   while (Globals.nextUnitOfWork && !shouldYield) {
//     Globals.nextUnitOfWork = performUnitOfWork(Globals.nextUnitOfWork);
//     shouldYield = deadline.timeRemaining() < 1;
//   }

//   if (!Globals.nextUnitOfWork && Globals.wipRoot) {
//     commitRoot();
//   }

//   requestIdleCallback(workLoop);
// }

// // 启动循环
// requestIdleCallback(workLoop);

// function performUnitOfWork(fiber: Fiber): Fiber | null {
//   const isFunctionComponent = fiber.type instanceof Function;
//   if (isFunctionComponent) {
//     updateFunctionComponent(fiber);
//   } else {
//     updateHostComponent(fiber);
//   }

//   // 深度优先遍历：先找子节点
//   if (fiber.child) {
//     return fiber.child;
//   }

//   let nextFiber: Fiber | undefined = fiber;
//   while (nextFiber) {
//     // 再找兄弟节点
//     if (nextFiber.sibling) {
//       return nextFiber.sibling;
//     }
//     // 最后找叔叔节点 (父节点的兄弟)
//     nextFiber = nextFiber.parent;
//   }
//   return null;
// }

// function updateFunctionComponent(fiber: Fiber) {
//   Globals.wipFiber = fiber;
//   Globals.hookIndex = 0;
//   Globals.wipFiber.hooks = [];

//   const fn = fiber.type as Function;
//   // 执行函数组件，获取 children
//   const children = [fn(fiber.props)];
//   reconcileChildren(fiber, children);
// }

// function updateHostComponent(fiber: Fiber) {
//   if (!fiber.dom) {
//     fiber.dom = createDom(fiber);
//   }
//   reconcileChildren(fiber, fiber.props.children);
// }

// --- 6. Reconciliation (Diff 算法) ---

// function reconcileChildren(Globals.wipFiber: Fiber, elements: any[]) {
//   let index = 0;
//   let oldFiber = Globals.wipFiber.alternate && Globals.wipFiber.alternate.child;
//   let prevSibling: Fiber | null = null;

//   // 展平数组，处理 Fragment 情况 (简化版)
//   const flatElements = elements.flat(Infinity);

//   while (index < flatElements.length || oldFiber != null) {
//     const element = flatElements[index];
//     let newFiber: Fiber | undefined = undefined; // 初始化为 undefined

//     const sameType = oldFiber && element && element.type === oldFiber.type;

//     if (sameType) {
//       // UPDATE
//       newFiber = {
//         type: oldFiber!.type,
//         props: element.props,
//         dom: oldFiber!.dom,
//         parent: Globals.wipFiber,
//         alternate: oldFiber,
//         effectTag: "UPDATE",
//       };
//     }
//     if (element && !sameType) {
//       // PLACEMENT
//       newFiber = {
//         type: element.type,
//         props: element.props,
//         dom: null,
//         parent: Globals.wipFiber,
//         alternate: null,
//         effectTag: "PLACEMENT",
//       };
//     }
//     if (oldFiber && !sameType) {
//       // DELETION
//       oldFiber.effectTag = "DELETION";
//       Globals.deletions.push(oldFiber);
//     }

//     if (oldFiber) {
//       oldFiber = oldFiber.sibling;
//     }

//     // 构建 Fiber 树的链表指针
//     if (index === 0) {
//       // 父节点的 child 指向第一个子节点
//       Globals.wipFiber.child = newFiber;
//     } else if (element && prevSibling) {
//       // 确保 prevSibling 存在
//       // 前一个子节点的 sibling 指向当前节点
//       prevSibling.sibling = newFiber;
//     }

//     if (newFiber) {
//       prevSibling = newFiber;
//     }
//     index++;
//   }
// }

// packages/react-dom/src/index.ts

// 辅助函数：安全地获取 key
// const getKey = (el: any, index: number) => {
//   // 优先取 props.key，如果没有则用 index 兜底 (与 React 行为一致)
//   return el?.props?.key !== undefined ? el.props.key : index;
// };

// function reconcileChildren(wipFiber: Fiber, elements: any[]) {
//   let index = 0;
//   // 旧 Fiber 链表的头节点
//   let oldFiber = wipFiber.alternate?.child;
//   let prevSibling: Fiber | null = null;

//   // 1. 将 elements 数组扁平化 (处理 Fragment 或数组嵌套)
//   const flatElements = elements.flat(Infinity);

//   // ---------------------------------------------------
//   // ✨ 新增：构建 oldFiber 的 Map 映射 (Key -> Fiber)
//   // ---------------------------------------------------
//   const existingChildren = new Map<string | number, Fiber>();
//   let tempFiber = oldFiber;
//   let i = 0;
//   while (tempFiber) {
//     const key =
//       tempFiber.key !== undefined && tempFiber.key !== null ? tempFiber.key : i; // 如果旧节点没 key，假设它用的是索引
//     existingChildren.set(key, tempFiber);
//     tempFiber = tempFiber.sibling;
//     i++;
//   }

//   // ---------------------------------------------------
//   // 2. 遍历新元素，通过 Key 尝试复用
//   // ---------------------------------------------------
//   while (index < flatElements.length) {
//     const element = flatElements[index];
//     let newFiber: Fiber | undefined = undefined;

//     const key = getKey(element, index);

//     // 在 Map 中查找是否有可复用的旧节点
//     const matchedFiber = existingChildren.get(key);

//     // 复用条件：Key 相同 且 Type 相同
//     const sameType =
//       matchedFiber && element && element.type === matchedFiber.type;

//     if (sameType) {
//       // ✅ UPDATE: 复用旧 Fiber
//       // 关键：从 Map 中移除，证明它被用掉了
//       existingChildren.delete(key);

//       newFiber = {
//         type: matchedFiber!.type,
//         props: element.props,
//         dom: matchedFiber!.dom, // 复用 DOM
//         parent: wipFiber,
//         alternate: matchedFiber,
//         effectTag: "UPDATE",
//         hooks: matchedFiber!.hooks, // ⚡️ 核心：保留 Hooks 状态 (useState 等)
//         key: key, // 传递 key
//       };
//     } else {
//       // 🆕 PLACEMENT: 新建 Fiber
//       // 注意：如果 matchedFiber 存在但 type 不同，它会留在 Map 中，稍后被删除
//       newFiber = {
//         type: element.type,
//         props: element.props,
//         dom: null,
//         parent: wipFiber,
//         alternate: null,
//         effectTag: "PLACEMENT",
//         key: key,
//       };
//     }

//     // 构建新 Fiber 树的链表 (child -> sibling -> sibling)
//     if (index === 0) {
//       wipFiber.child = newFiber;
//     } else if (element && prevSibling) {
//       prevSibling.sibling = newFiber;
//     }

//     if (newFiber) {
//       prevSibling = newFiber;
//     }
//     index++;
//   }

//   // ---------------------------------------------------
//   // 3. 删除剩余的旧节点
//   // ---------------------------------------------------
//   // 此时 Map 中剩下的都是没被复用的，标记删除
//   existingChildren.forEach((fiber) => {
//     fiber.effectTag = "DELETION";
//     Globals.deletions.push(fiber);
//   });
// }

// --- 7. Hooks ---

// export function useState<T>(
//   initial: T,
// ): [T, (action: T | ((prevState: T) => T)) => void] {
//   if (!Globals.wipFiber) {
//     throw new Error("useState must be used within a component.");
//   }

//   const oldHook =
//     Globals.wipFiber.alternate &&
//     Globals.wipFiber.alternate.hooks &&
//     Globals.wipFiber.alternate.hooks[Globals.hookIndex];

//   const hook: Hook = {
//     tag: "STATE", // 标记类型
//     state: oldHook ? oldHook.state : initial,
//     queue: [],
//   };

//   const actions = oldHook ? oldHook.queue : [];
//   actions?.forEach((action) => {
//     if (action instanceof Function) {
//       hook.state = action(hook.state);
//     } else {
//       hook.state = action;
//     }
//   });

//   const setState = (action: any) => {
//     hook.queue!.push(action);
//     if (Globals.currentRoot) {
//       Globals.wipRoot = {
//         dom: Globals.currentRoot.dom,
//         props: Globals.currentRoot.props,
//         alternate: Globals.currentRoot,
//       };
//       Globals.nextUnitOfWork = Globals.wipRoot;
//       Globals.deletions = [];
//     }
//   };

//   Globals.wipFiber.hooks!.push(hook);
//   Globals.hookIndex++;
//   return [hook.state, setState];
// }

// ✨ 新增: useEffect
// export function useEffect(callback: () => void | (() => void), deps?: any[]) {
//   if (!Globals.wipFiber) {
//     throw new Error("useEffect must be used within a component.");
//   }

//   const oldHook =
//     Globals.wipFiber.alternate &&
//     Globals.wipFiber.alternate.hooks &&
//     Globals.wipFiber.alternate.hooks[Globals.hookIndex];

//   // 检查依赖是否变化
//   // 如果没有旧 hook，或者是第一次渲染 -> true
//   // 如果没有传入 deps -> 每次都执行 -> true
//   // 如果有 deps，比较每一项
//   const hasChanged = deps
//     ? !oldHook ||
//       !oldHook.deps ||
//       oldHook.deps.length !== deps.length ||
//       deps.some((dep, i) => dep !== oldHook.deps![i])
//     : true;

//   const hook: Hook = {
//     tag: "EFFECT",
//     callback: callback,
//     deps: deps,
//     // 如果有旧 hook，我们要继承它的 cleanup，因为在 commit 阶段如果需要执行 effect，
//     // 我们得先执行上一次的 cleanup。
//     cleanup: oldHook?.cleanup,
//     hasChanged: hasChanged,
//   };

//   Globals.wipFiber.hooks!.push(hook);
//   Globals.hookIndex++;
// }

// --- 8. Public API ---

// export function render(element: ReactElement, container: HTMLElement) {
//   Globals.wipRoot = {
//     dom: container,
//     props: {
//       children: [element],
//     },
//     alternate: Globals.currentRoot,
//   };
//   Globals.deletions = [];
//   Globals.nextUnitOfWork = Globals.wipRoot;
// }
