/**
 * Where the console starts.
 *
 * The token stylesheet is injected once here rather than imported as a .css
 * file, because it is generated from design/tokens.json at module load — the
 * same source both apps read, so a contrast fix made there lands here too.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { globalCss } from "@/theme";

const style = document.createElement("style");
style.textContent = globalCss;
document.head.appendChild(style);

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
