import React from "@koact/react";
import { useState } from "@koact/react-dom";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <h1>Hello Koact (JS Mode)</h1>
      <button onClick={() => setCount((c) => c + 1)}>Count is: {count}</button>
    </div>
  );
}

export default App;
