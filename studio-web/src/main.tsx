import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { initializeDesktopRuntime } from "./desktopRuntime";
import "./styles.css";

async function bootstrap() {
  const root = document.getElementById("root")!;
  try {
    await initializeDesktopRuntime();
  } catch (error) {
    root.textContent = error instanceof Error ? error.message : "Desktop runtime initialization failed";
    return;
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
