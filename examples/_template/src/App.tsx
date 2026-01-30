import Koact from "@koact/react";
import { useState } from "@koact/react-dom";

export function App() {
  const [count, setCount] = useState(0);

  const styles = {
    wrapper: {
      minHeight: "100vh",
      width: "100vw",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#242424", // 经典的程序员深灰色
      color: "rgba(255, 255, 255, 0.87)",
      fontFamily: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif",
      lineHeight: "1.5",
      margin: 0,
    },
    logo: {
      fontSize: "3.2em",
      lineHeight: "1.1",
      fontWeight: "bold",
      // 使用 CSS 渐变替代图标，既好看又不用担心字符显示问题
      background: "linear-gradient(315deg, #42d392 25%, #647eff)",
      backgroundClip: "text",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      margin: "0 0 1rem 0",
    },
    card: {
      padding: "2em",
      textAlign: "center",
    },
    button: {
      borderRadius: "8px",
      border: "1px solid #646cff", // 极客蓝边框
      padding: "0.6em 1.2em",
      fontSize: "1em",
      fontWeight: "500",
      fontFamily: "inherit",
      backgroundColor: "#1a1a1a",
      color: "#fff",
      cursor: "pointer",
      transition: "border-color 0.25s",
    },
    text: {
      marginTop: "1em",
      fontSize: "1rem",
      color: "#888",
    },
    code: {
      backgroundColor: "#1a1a1a",
      padding: "0.2em 0.4em",
      borderRadius: "4px",
      color: "#fff",
      fontFamily: "monospace",
    },
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h1 style={styles.logo}>Vite + Koact</h1>

        <div style={{ marginTop: "2rem" }}>
          <button style={styles.button} onClick={() => setCount((c) => c + 1)}>
            count is {count}
          </button>
        </div>

        <p style={styles.text}>
          Edit <code style={styles.code}>src/App.tsx</code> to test HMR
        </p>

        <p style={{ ...styles.text, fontSize: "0.8rem", color: "#555" }}>
          Click on the logos to learn more
        </p>
      </div>
    </div>
  );
}
