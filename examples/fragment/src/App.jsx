import Koact from "@koact/react";
import { useState } from "@koact/react-dom";

function Notifications() {
  return (
    <>
      <div className="toast success">✅ 操作成功</div>
      <div className="toast info">ℹ️ 记得保存</div>
    </>
  );
}

function App() {
  const [show, setShow] = useState(true);

  return (
    <div className="container">
      <button onClick={() => setShow((pre) => !pre)}>切换消息</button>
      <div className="list-area">
        {/* 当 show 变为 false 时，<Notifications /> 及其子树应该被完全移除 */}
        {show && <Notifications />}
      </div>
    </div>
  );
}
export default App;
