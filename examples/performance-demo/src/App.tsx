import Koact from "@koact/react";
import { useState, useMemo } from "@koact/react-dom";

// === 通用部分 ===
const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "20px",
    fontFamily: "sans-serif",
    background: "#242424",
    minHeight: "100vh",
    color: "white",
  },
  card: {
    background: "#333",
    padding: "20px",
    borderRadius: "10px",
    width: "400px",
    marginBottom: "20px",
  },
  btnGroup: { display: "flex", gap: "10px", marginBottom: "20px" },
  btn: (active: boolean) => ({
    padding: "10px 20px",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    background: active ? "#42d392" : "#555",
    color: active ? "#000" : "#fff",
    fontWeight: "bold",
  }),
};

function expensiveCalculation(num: number) {
  console.log("😫 计算中...");
  const start = performance.now();
  while (performance.now() - start < 500) {} // 阻塞 500ms
  return num * 2;
}

// 🐢 慢组件 (没有 useMemo)
function SlowComponent() {
  const [number, setNumber] = useState(10);
  const [text, setText] = useState("");

  // 🔴 只要 text 变了，这个函数也会重新执行 -> 卡顿
  const result = expensiveCalculation(number);

  return (
    <div style={styles.card}>
      <h2 style={{ color: "#ff6b6b" }}>🐢 慢速模式 (无优化)</h2>
      <p>打字会非常卡，因为每次按键都在做昂贵计算。</p>
      <input
        value={text}
        onInput={(e: any) => setText(e.target.value)}
        placeholder="在这里打字体验卡顿..."
        style={{ width: "100%", padding: "8px" }}
      />
      <p>
        结果: {result} (基数: {number})
      </p>
      <button onClick={() => setNumber((n) => n + 1)}>修改基数+1</button>
    </div>
  );
}

// 🐇 快组件 (有 useMemo)
function FastComponent() {
  const [number, setNumber] = useState(10);
  const [text, setText] = useState("");

  // ✅ 只有当 number 变了才重算，text 变了直接用缓存 -> 流畅
  const result = useMemo(() => {
    return expensiveCalculation(number);
  }, [number]);

  return (
    <div style={styles.card}>
      <h2 style={{ color: "#42d392" }}>🐇 极速模式 (useMemo)</h2>
      <p>打字非常流畅！计算被缓存了。</p>
      <input
        value={text}
        onInput={(e: any) => setText(e.target.value)}
        placeholder="在这里打字体验丝滑..."
        style={{ width: "100%", padding: "8px" }}
      />
      <p>
        结果: {result} (基数: {number})
      </p>
      <button onClick={() => setNumber((n) => n + 1)}>修改基数+1</button>
    </div>
  );
}

// 🎛️ 主控制器
export function App() {
  const [mode, setMode] = useState("slow"); // "slow" | "fast"

  return (
    <div style={styles.container}>
      <h1>性能对比实验室 🧪</h1>

      <div style={styles.btnGroup}>
        <button
          style={styles.btn(mode === "slow")}
          onClick={() => setMode("slow")}
        >
          🐢 慢速模式
        </button>
        <button
          style={styles.btn(mode === "fast")}
          onClick={() => setMode("fast")}
        >
          🐇 极速模式
        </button>
      </div>

      {mode === "slow" ? <SlowComponent /> : <FastComponent />}
    </div>
  );
}
