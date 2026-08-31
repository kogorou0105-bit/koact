import type { Fiber } from "./types";

export function createDom(fiber: Fiber): HTMLElement | Text {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type as string);

  updateDom(dom, {}, fiber.pendingProps);
  return dom;
}

const isEvent = (key: string) => key.startsWith("on");
const isProperty = (key: string) =>
  key !== "children" && key !== "key" && key !== "ref" && !isEvent(key);

function getEventConfig(name: string) {
  const capture = name.endsWith("Capture");
  const eventName = name.slice(2, capture ? -7 : undefined).toLowerCase();
  return { capture, eventName };
}

function setStyleValue(style: CSSStyleDeclaration, name: string, value: unknown) {
  if (name.startsWith("--")) {
    if (value === null || value === undefined || value === "") {
      style.removeProperty(name);
    } else {
      style.setProperty(name, String(value));
    }
    return;
  }

  (style as any)[name] = value === null || value === undefined ? "" : value;
}

function updateStyle(
  dom: HTMLElement,
  previousStyle: unknown,
  nextStyle: unknown,
) {
  if (typeof nextStyle === "string") {
    dom.style.cssText = nextStyle;
    return;
  }

  if (!nextStyle || typeof nextStyle !== "object") {
    dom.style.cssText = "";
    return;
  }

  if (typeof previousStyle === "string") {
    dom.style.cssText = "";
  } else if (previousStyle && typeof previousStyle === "object") {
    Object.keys(previousStyle).forEach((name) => {
      if (!(name in nextStyle)) setStyleValue(dom.style, name, "");
    });
  }

  Object.entries(nextStyle).forEach(([name, value]) => {
    if (!Object.is((previousStyle as Record<string, unknown>)?.[name], value)) {
      setStyleValue(dom.style, name, value);
    }
  });
}

function removeDomProperty(dom: HTMLElement | Text, name: string, value: unknown) {
  if (name === "style" && dom instanceof HTMLElement) {
    updateStyle(dom, value, null);
    return;
  }

  if (dom instanceof Element && (name.startsWith("data-") || name.startsWith("aria-"))) {
    dom.removeAttribute(name);
    return;
  }

  if (name in dom) {
    const currentValue = (dom as any)[name];
    (dom as any)[name] = typeof currentValue === "boolean" ? false : "";
  } else if (dom instanceof Element) {
    dom.removeAttribute(name);
  }
}

function setDomProperty(dom: HTMLElement | Text, name: string, value: unknown) {
  if (name === "style" && dom instanceof HTMLElement) return;

  if (value === null || value === undefined || value === false) {
    removeDomProperty(dom, name, value);
    return;
  }

  if (dom instanceof Element && (name.startsWith("data-") || name.startsWith("aria-"))) {
    dom.setAttribute(name, String(value));
  } else if (name in dom) {
    (dom as any)[name] = value;
  } else if (dom instanceof Element) {
    dom.setAttribute(name, String(value));
  }
}

export function updateDom(
  dom: HTMLElement | Text,
  previousProps: Record<string, any>,
  nextProps: Record<string, any>,
) {
  Object.keys(previousProps)
    .filter(isEvent)
    .filter(
      (name) =>
        !(name in nextProps) || previousProps[name] !== nextProps[name],
    )
    .forEach((name) => {
      const { capture, eventName } = getEventConfig(name);
      dom.removeEventListener(eventName, previousProps[name], capture);
    });

  Object.keys(previousProps)
    .filter(isProperty)
    .filter((name) => !(name in nextProps))
    .forEach((name) => removeDomProperty(dom, name, previousProps[name]));

  Object.keys(nextProps)
    .filter(isProperty)
    .filter(
      (name) =>
        name === "style" || previousProps[name] !== nextProps[name],
    )
    .forEach((name) => {
      if (name === "style" && dom instanceof HTMLElement) {
        updateStyle(dom, previousProps[name], nextProps[name]);
      } else {
        setDomProperty(dom, name, nextProps[name]);
      }
    });

  Object.keys(nextProps)
    .filter(isEvent)
    .filter((name) => previousProps[name] !== nextProps[name])
    .forEach((name) => {
      const { capture, eventName } = getEventConfig(name);
      dom.addEventListener(eventName, nextProps[name], capture);
    });
}
