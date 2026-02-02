// packages/react-dom/src/events.ts

// 定义事件类型
type EventMap = {
  commit: any; // 这里可以是 FiberRoot 类型
};

type Callback<T> = (data: T) => void;

class EventEmitter {
  private listeners: Map<keyof EventMap, Set<Callback<any>>> = new Map();

  // 订阅事件
  on<K extends keyof EventMap>(event: K, cb: Callback<EventMap[K]>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
  }

  // 触发事件
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => cb(data));
    }
  }
}

// 导出一个单例
export const KoactEvents = new EventEmitter();
