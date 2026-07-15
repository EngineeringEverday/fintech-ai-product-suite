import { ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Logo } from "./Logo";
import { getHealth } from "@/lib/api";

const NAV = [
  { to: "/", label: "Upload", testid: "nav-upload" },
  { to: "/batch", label: "Batch", testid: "nav-batch" },
  { to: "/analytics", label: "Analytics", testid: "nav-analytics" },
];

export function Layout({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState<boolean>(false);
  const [health, setHealth] = useState<{ model_mode: string; device: string } | null>(null);
  const location = useLocation();

  useEffect(() => {
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    setDark(!!prefersDark);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealth({ model_mode: "mock", device: "preview" }));
  }, []);

  return (
    <div className="min-h-screen flex bg-canvas-50 dark:bg-canvas-900">
      <aside className="w-64 bg-canvas-900 dark:bg-black/40 text-canvas-100 flex flex-col">
        <div className="px-5 py-5 border-b border-canvas-800 flex items-center gap-3">
          <div className="text-signal-400">
            <Logo size={32} />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">KYB Donut</div>
            <div className="text-[11px] text-canvas-400">Merchant onboarding</div>
          </div>
        </div>
        <nav className="px-3 py-4 space-y-1 flex-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              data-testid={item.testid}
              className={({ isActive }) =>
                `nav-link ${isActive ? "nav-link-active" : ""}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-canvas-800 space-y-2">
          <div className="text-[11px] text-canvas-400 leading-relaxed">
            <div
              data-testid="status-runtime"
              className="rounded-md border border-canvas-800 bg-canvas-950/50 px-2 py-1.5"
            >
              Runtime ·{" "}
              <span className="text-canvas-100 font-mono">
                {health?.model_mode ?? "mock"} / {health?.device ?? "preview"}
              </span>
            </div>
          </div>
          <button
            onClick={() => setDark((v) => !v)}
            data-testid="button-toggle-theme"
            className="w-full text-left text-xs px-2 py-1.5 rounded-md bg-canvas-800 hover:bg-canvas-700 transition"
          >
            {dark ? "Switch to light" : "Switch to dark"}
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="px-8 py-5 border-b border-canvas-200 dark:border-canvas-700 bg-white/70 dark:bg-canvas-900/70 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold text-canvas-900 dark:text-canvas-50 tracking-tight">
                {pageTitle(location.pathname)}
              </h1>
              <p className="text-xs text-canvas-500 dark:text-canvas-300">
                Donut-based document understanding · Indian KYB merchant onboarding
              </p>
            </div>
            <div className="text-xs text-canvas-500 dark:text-canvas-300">
              Target human-review rate · <span className="font-mono text-signal-600 dark:text-signal-400">23%</span>
            </div>
          </div>
        </header>
        <div className="px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

function pageTitle(path: string) {
  if (path.startsWith("/batch")) return "Batch processing";
  if (path.startsWith("/analytics")) return "Analytics";
  if (path.startsWith("/result")) return "Extraction results";
  return "Upload documents";
}
