import { NavLink, Outlet } from "react-router-dom";
import { Logo } from "./Logo";
import { LayoutDashboard, Search, User, BrainCircuit, Github } from "lucide-react";

const nav = [
  { to: "/", label: "Risk Lookup", icon: Search },
  { to: "/merchant/MID10000001", label: "Merchant 360", icon: User },
  { to: "/dashboard", label: "Portfolio", icon: LayoutDashboard },
  { to: "/model", label: "Model & Explainability", icon: BrainCircuit },
];

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink-800 bg-ink-950/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 text-ink-50">
              <Logo size={22} />
              <span className="font-semibold tracking-tight">Sentinel</span>
              <span className="text-ink-400 text-xs hidden sm:inline">
                · Merchant Risk Operations
              </span>
            </div>
            <nav className="flex gap-1" data-testid="primary-nav">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/"}
                  data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                      isActive
                        ? "bg-ink-800 text-ink-50"
                        : "text-ink-300 hover:text-ink-50 hover:bg-ink-800/50"
                    }`
                  }
                >
                  <n.icon size={13} />
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-400">
            <span className="hidden md:inline">v1.0.0</span>
            <span className="pill bg-emerald-900/30 text-emerald-300 border border-emerald-900/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Production
            </span>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-ink-800 text-[11px] text-ink-500 py-4 px-6 text-center">
        Sentinel · Risk = probability of platform financial loss from chargebacks,
        fraud, or regulatory violations. Built for Indian payments platforms.
      </footer>
    </div>
  );
}
