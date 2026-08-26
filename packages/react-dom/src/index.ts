import type { ReactNode } from "@koact/react";
import type { FiberRoot } from "./types";
import {
  getOrCreateRoot,
  unmountContainer,
  updateContainer,
} from "./scheduler";
import { initDevTools } from "./devTools";

initDevTools();

export interface Root {
  render(element: ReactNode): void;
  unmount(): void;
}

function assertValidContainer(container: HTMLElement) {
  if (!container || typeof container.insertBefore !== "function") {
    throw new TypeError("Koact root container must be a DOM element.");
  }
}

function createPublicRoot(internalRoot: FiberRoot): Root {
  return {
    render(element) {
      updateContainer(element, internalRoot);
    },
    unmount() {
      unmountContainer(internalRoot);
    },
  };
}

export function createRoot(container: HTMLElement): Root {
  assertValidContainer(container);
  return createPublicRoot(getOrCreateRoot(container));
}

export function render(element: ReactNode, container: HTMLElement) {
  assertValidContainer(container);
  updateContainer(element, getOrCreateRoot(container));
}

const ReactDOM = {
  render,
  createRoot,
};

export default ReactDOM;
