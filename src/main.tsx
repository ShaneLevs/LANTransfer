import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import { applyColorScheme } from "@/lib/theme";
import "@/index.css";

applyColorScheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
