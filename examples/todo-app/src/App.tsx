import React from "@koact/react";
import type { ChangeEvent } from "react";
import { useState, useEffect } from "@koact/react";

/** @jsx React.createElement */

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

// 导出组件
export default function App() {
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, text: "1", done: false },
    { id: 2, text: "2", done: false },
  ]);
  const [inputText, setInputText] = useState("");
  const [willDeleteId, setWillDeleteId] = useState<number[]>([]);
  // 处理输入框变化
  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    // 这里虽然不依赖旧状态，但保持一致性也可以写成函数
    // e.target.value 是原生 DOM 属性
    const val = e.target.value;
    setInputText(() => val);
  };

  // 1. 新增 Todo (依赖旧数组 -> 追加)
  const handleAdd = () => {
    if (!inputText) return;

    setTodos((prevTodos) => {
      // 返回一个新的数组，不要直接 push 修改 prevTodos
      if (prevTodos.length === 0)
        return [{ id: 1, text: inputText, done: false }];

      return [
        ...prevTodos,
        {
          id: prevTodos[prevTodos.length - 1].id + 1,
          text: inputText,
          done: false,
        },
      ];
    });

    // 清空输入框
    setInputText(() => "");
  };

  // 2. 切换完成状态 (依赖旧数组 -> 遍历修改)
  const toggleTodo = (index: number) => {
    setTodos((prevTodos) => {
      // map 返回新数组，不污染原数组
      return prevTodos.map((todo, i) => {
        if (i === index) {
          return { ...todo, done: !todo.done };
        }
        return todo;
      });
    });
  };

  useEffect(() => {
    console.log("App mounted or updated");

    // 模拟订阅/清理
    const timer = setInterval(() => {
      console.log("Timer ticking...");
    }, 1000);

    return () => {
      console.log("Cleanup timer");
      clearInterval(timer);
    };
  }, []); // 空数组，只在 mount/unmount 执行

  // 3. 清理已完成 (依赖旧数组 -> 过滤)
  const clearDone = () => {
    setWillDeleteId(() => {
      return todos.filter((todo) => todo.done).map((todo) => todo.id);
    });
  };

  const handleTransitionEnd = (e) => {
    if (e.propertyName !== "opacity") return;

    setTodos((prevTodos) => {
      return prevTodos.filter((todo) => !todo.done);
    });
    setWillDeleteId([]);
  };

  // 动态计算剩余数量
  const remaining = todos.filter((t) => !t.done).length;

  return (
    <div
      style={{
        padding: "30px",
        maxWidth: "400px",
        margin: "0 auto",
        fontFamily: "sans-serif",
      }}
    >
      <h1 style={{ borderBottom: "2px solid #667eea", paddingBottom: "10px" }}>
        Koact Todo
      </h1>

      {/* 输入区域 */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <input
          value={inputText}
          onInput={handleInput}
          placeholder="添加新任务..."
          style={{ flex: 1, padding: "8px", fontSize: "16px" }}
        />
        <button
          onClick={handleAdd}
          style={{
            padding: "8px 16px",
            background: "#667eea",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          添加
        </button>
      </div>

      {/* 列表区域 */}
      <ul style={{ listStyle: "none", padding: "0" }}>
        {todos.map((todo, index) => {
          let willBeDeleted = false;
          if (willDeleteId.includes(todo.id)) willBeDeleted = true;
          return (
            <li
              onClick={() => toggleTodo(index)}
              key={todo.id}
              style={{
                padding: "10px",
                borderBottom: "1px solid #eee",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                // 动态属性直接写条件判断
                textDecoration: todo.done ? "line-through" : "none",
                color: todo.done ? "#aaa" : "#333",
                background: todo.done ? "#f9f9f9" : "white",
                transition: "opacity 0.5s ease",
                opacity: willBeDeleted ? 0 : 1,
              }}
              onTransitionEnd={handleTransitionEnd}
            >
              <input />
              <span style={{ marginRight: "10px" }}>
                {todo.done ? "✅" : "❔"}
              </span>
              {todo.text}
            </li>
          );
        })}
      </ul>

      {/* 底部工具栏 */}
      <div
        style={{
          marginTop: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#666",
          fontSize: "14px",
        }}
      >
        <span>剩余 {remaining} 项任务未完成</span>
        {todos.some((t) => t.done) && (
          <button
            onClick={clearDone}
            style={{
              color: "#e53e3e",
              background: "none",
              border: "1px solid #e53e3e",
              padding: "4px 8px",
              cursor: "pointer",
              borderRadius: "4px",
            }}
          >
            清除已完成的任务
          </button>
        )}
      </div>
    </div>
  );
}
