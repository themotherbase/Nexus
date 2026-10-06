import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import motherbaseLogo from "../images/The Motherbase (Transparent).png";

const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/png";
favicon.href = motherbaseLogo;
document.head.appendChild(favicon);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
