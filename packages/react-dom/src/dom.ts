// packages/react-dom/src/dom.ts
import { Fiber } from "./types";

export function createDom(fiber: Fiber): HTMLElement | Text {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type as string);

  updateDom(dom, {}, fiber.props);

  return dom;
}

const isEvent = (key: string) => key.startsWith("on");
const isProperty = (key: string) =>
  key !== "children" && key !== "ref" && !isEvent(key);
const isNew = (prev: any, next: any) => (key: string) =>
  prev[key] !== next[key];
const isGone = (prev: any, next: any) => (key: string) => !(key in next);

export function updateDom(
  dom: HTMLElement | Text,
  prevProps: any,
  nextProps: any,
) {
  // 1. 移除旧的或变化的事件监听
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // 2. 移除旧属性
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      (dom as any)[name] = "";
    });

  // 3. 设置新属性或变化的属性
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      if (name === "style") {
        const style = nextProps[name];
        if (typeof style === "object" && style !== null) {
          Object.keys(style).forEach((key) => {
            (dom as HTMLElement).style[key as any] = style[key];
          });
        } else if (typeof style === "string") {
          (dom as HTMLElement).style.cssText = style;
        }
      } else {
        (dom as any)[name] = nextProps[name];
      }
    });

  // 4. 添加新事件
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}
