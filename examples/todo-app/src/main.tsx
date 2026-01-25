import React from "@koact/react";
import ReactDOM from "@koact/react-dom";
import App from "./App"; // 引入刚才拆分出来的组件

/** @jsx React.createElement */

const root = document.getElementById("root");
if (root) {
  ReactDOM.render(<App />, root);
}
