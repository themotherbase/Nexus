import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import motherbaseLogo from "./The Motherbase (Transparent).png";

const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/png";
document.head.appendChild(favicon);

const faviconImage = new Image();
faviconImage.onload = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const cropSize = Math.round(Math.min(faviconImage.naturalWidth, faviconImage.naturalHeight) * 0.36);
  const cropX = (faviconImage.naturalWidth - cropSize) / 2;
  const cropY = Math.round(faviconImage.naturalHeight * 0.31);
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(faviconImage, cropX, cropY, cropSize, cropSize, 0, 0, 64, 64);
  favicon.href = canvas.toDataURL("image/png");
};
faviconImage.src = motherbaseLogo;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
