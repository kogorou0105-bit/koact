// 模拟 requestIdleCallback
globalThis.requestIdleCallback = function (callback) {
  return setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => 50, // 假装还剩 50ms
    });
  }, 1) as unknown as number;
};

// 模拟 cancelIdleCallback
globalThis.cancelIdleCallback = function (id) {
  clearTimeout(id);
};
