// packages/react-dom/src/scheduler.ts
import { ReactElement } from "@koact/react";
import { Globals } from "./globals";
import { performUnitOfWork } from "./reconciler";
import { commitRoot } from "./commit";

export function render(element: ReactElement, container: HTMLElement) {
  Globals.wipRoot = {
    dom: container,
    type: "div",
    props: {
      children: [element],
    },
    alternate: Globals.currentRoot,
  };
  Globals.deletions = [];
  Globals.nextUnitOfWork = Globals.wipRoot;
}

function workLoop(deadline: IdleDeadline) {
  let shouldYield = false;
  while (Globals.nextUnitOfWork && !shouldYield) {
    Globals.nextUnitOfWork = performUnitOfWork(Globals.nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  if (!Globals.nextUnitOfWork && Globals.wipRoot) {
    commitRoot();
  }

  requestIdleCallback(workLoop);
}

requestIdleCallback(workLoop);
