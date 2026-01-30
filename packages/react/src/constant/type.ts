export interface ChangeEvent<T = any> {
  target: T;
  type?: string;
  // 你可以根据需要补充更多原生 Event 的属性，比如 preventDefault
  preventDefault?: () => void;
  stopPropagation?: () => void;
}
