import Koact from "@koact/react";
import { useRef, useState } from "@koact/react";

export function App() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [count, setCount] = useState(0);
  const handleFocus = () => {
    // 场景目标：不操作 DOM ID，直接通过 Ref 操作
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.style.border = "2px solid rgb(66, 211, 146)";
    }
  };

  return (
    <div style={{ padding: "50px", textAlign: "center" }}>
      <h1>Koact Ref Demo 🎯</h1>
      <div style={{ marginBottom: "20px" }}>
        <input
          ref={inputRef}
          placeholder="点击下方按钮聚焦我..."
          style={{
            padding: "10px",
            width: "200px",
            outline: "none",
          }}
        />
      </div>
      <div>
        <button onClick={handleFocus}>聚焦输入框</button>
        <button
          onClick={() => setCount((c) => c + 1)}
          style={{ marginLeft: "10px" }}
        >
          刷新组件 ({count})
        </button>
      </div>
      <p style={{ color: "#888", fontSize: "14px" }}>
        如果 Ref 工作正常，点击聚焦按钮，输入框应高亮并获得焦点。
        <br />
        且刷新组件不会导致 Ref 丢失。
      </p>
    </div>
  );
}
