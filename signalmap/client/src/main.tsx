import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

// Always dark mode for SignalMap
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
