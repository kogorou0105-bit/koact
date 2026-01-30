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

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitDeletion(fiber: Fiber, domParent?: HTMLElement | Text) {
  // 如果没有传入 domParent，则自动向上查找最近的 DOM 父节点
  if (!domParent) {
    let parent = fiber.parent;
    while (parent && !parent.dom) {
      parent = parent.parent;
    }
    if (parent && parent.dom) domParent = parent.dom;
  }

  // 1. 如果当前 fiber 有 DOM，直接从父节点移除
  if (fiber.dom && domParent) {
    domParent.removeChild(fiber.dom);
  }

  // 2. 递归清理 Hooks (useEffect cleanup)
  cleanupHooks(fiber);

  // 3. 如果当前 fiber 没有 DOM (即函数组件)，
  // 我们需要递归查找其子节点中真正的 DOM 进行移除
  // 注意：这里我们把找到的 domParent 传下去，避免子节点重复查找
  if (!fiber.dom && fiber.child) {
    commitDeletion(fiber.child, domParent);
  }
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
