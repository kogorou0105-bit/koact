import React from "@koact/react";
import { useState } from "@koact/react-dom";

function App() {
  const [count, setCount] = useState(0);

  const styles = {
    container: {
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#1a1a1a",
      color: "#ffffff",
      fontFamily: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif",
      margin: 0,
      textAlign: "center",
    },
    main: {
      padding: "2rem",
      borderRadius: "16px",
      background: "rgba(255, 255, 255, 0.05)",
      backdropFilter: "blur(10px)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
    },
    title: {
      fontSize: "3.5rem",
      fontWeight: "800",
      margin: "0 0 1rem 0",
      background: "linear-gradient(135deg, #646cff 0%, #42d392 100%)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      letterSpacing: "-0.02em",
    },
    description: {
      color: "#888",
      fontSize: "1.1rem",
      marginBottom: "2rem",
    },
    button: {
      backgroundColor: "#646cff",
      color: "white",
      border: "none",
      padding: "0.8rem 1.6rem",
      fontSize: "1rem",
      fontWeight: "600",
      borderRadius: "8px",
      cursor: "pointer",
      transition: "all 0.2s ease",
      boxShadow: "0 4px 6px rgba(100, 108, 255, 0.2)",
    },
    footer: {
      marginTop: "2rem",
      fontSize: "0.9rem",
      color: "#555",
    },
    code: {
      fontFamily: "monospace",
      backgroundColor: "#2a2a2a",
      padding: "0.2rem 0.4rem",
      borderRadius: "4px",
      color: "#42d392",
    },
  };

  return (
    <div style={styles.container}>
      <main style={styles.main}>
        <h1 style={styles.title}>Koact + JS</h1>
        <p style={styles.description}>轻量级 Fiber 架构 React 实现</p>

        <button
          style={styles.button}
          onClick={() => setCount((c) => c + 1)}
          onMouseOver={(e) => (e.target.style.backgroundColor = "#747bff")}
          onMouseOut={(e) => (e.target.style.backgroundColor = "#646cff")}
        >
          计数器: {count}
        </button>

        <p style={styles.footer}>
          编辑 <code style={styles.code}>src/App.jsx</code> 开启你的创意
        </p>
      </main>
    </div>
  );
}

export default App;
