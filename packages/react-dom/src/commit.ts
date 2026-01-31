// packages/react-dom/src/commit.ts
import { Fiber } from "./types";
import { updateDom } from "./dom";
import { Globals } from "./globals";

export function commitRoot() {
  Globals.deletions.forEach((fiber) => commitDeletion(fiber));

  if (Globals.wipRoot && Globals.wipRoot.child) {
    commitWork(Globals.wipRoot.child);
  }
  if (Globals.wipRoot) {
    commitEffects(Globals.wipRoot);
  }
  Globals.currentRoot = Globals.wipRoot;
  Globals.wipRoot = null;
}

function commitWork(fiber?: Fiber) {
  if (!fiber) {
    return;
  }

  let domParentFiber = fiber.parent;
  while (!domParentFiber || !domParentFiber.dom) {
    domParentFiber = domParentFiber?.parent;
  }
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate?.props || {}, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    // commitDeletion 已经处理了 DOM 移除
  }
  commitRef(fiber);
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitRef(fiber: Fiber) {
  if (fiber.props && fiber.props.ref) {
    fiber.props.ref.current = fiber.dom;
  }
}

function commitDeletion(fiber: Fiber, domParent?: HTMLElement | Text) {
  // 1. 自动向上查找最近的 DOM 父节点 (保持原有逻辑)
  if (!domParent) {
    let parent = fiber.parent;
    while (parent && !parent.dom) {
      parent = parent.parent;
    }
    if (parent && parent.dom) domParent = parent.dom;
  }

  // 2. 处理 DOM 移除
  if (fiber.dom && domParent) {
    // 情况 A: 当前 Fiber 有真实 DOM (如 div, p)
    // 直接移除即可，浏览器会自动移除其下的所有子元素视觉表现
    domParent.removeChild(fiber.dom);
  } else {
    // 情况 B: 当前 Fiber 没有 DOM (如 Fragment, 函数组件)
    // 它的“本体”就是它所有的子节点。
    // 我们必须遍历它的 children 链表，递归调用 commitDeletion，
    // 确保它的每一个子节点（及其子树中的 DOM）都被移除。

    let child = fiber.child;
    while (child) {
      commitDeletion(child, domParent);
      child = child.sibling;
    }
  }

  // 3. 清理 Hooks
  // 注意：这里的 cleanupHooks 也会递归清理子树的 hooks。
  // 虽然在上面的 while 循环中 commitDeletion(child) 也会触发子节点的 cleanupHooks，
  // 导致一定的重复遍历，但在简单实现中这是为了确保当前 fiber 自身的 hooks (如果是函数组件) 能被清理。
  cleanupHooks(fiber);
}

function commitEffects(fiber: Fiber | null) {
  if (!fiber) return;

  commitEffects(fiber.child || null);
  commitEffects(fiber.sibling || null);

  if (fiber.hooks) {
    fiber.hooks.forEach((hook) => {
      if (hook.tag === "EFFECT" && hook.hasChanged) {
        if (hook.cleanup) {
          hook.cleanup();
        }
        const cleanup = hook.callback!();
        if (typeof cleanup === "function") {
          hook.cleanup = cleanup;
        }
      }
    });
  }
}

function cleanupHooks(fiber: Fiber | null) {
  if (!fiber) return;

  if (fiber.hooks) {
    fiber.hooks.forEach((h) => {
      if (h.tag === "EFFECT" && h.cleanup) {
        h.cleanup();
      }
    });
  }

  // 注意：这里只需要清理 hooks，不需要移除 DOM，因为 DOM 移除逻辑在 commitDeletion 主体里处理
  cleanupHooks(fiber.child || null);
  cleanupHooks(fiber.sibling || null);
}
