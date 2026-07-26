import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { boot } from "./telegram.js";
import "./styles.css";

boot();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
