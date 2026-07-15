import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Logo } from './Logo';
import { Button } from '@/components/ui/button';
import { Settings, BookOpen, ShieldCheck, FlaskConical } from 'lucide-react';
import { SettingsDialog } from './SettingsDialog';

const NAV = [
  { href: '/', label: 'Studio', testid: 'nav-studio' },
  { href: '/evals', label: 'Eval Framework', testid: 'nav-evals', icon: FlaskConical },
  { href: '/privacy', label: 'Data Privacy', testid: 'nav-privacy', icon: ShieldCheck },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="max-w-[1280px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
              <Logo />
            </Link>
            <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
              {NAV.map((item) => {
                const active = loc === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-testid={item.testid}
                    className={`px-3 py-1.5 text-[13.5px] rounded-md transition-colors ${
                      active
                        ? 'text-foreground font-medium bg-accent'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://docs.anthropic.com/en/api/messages"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-docs"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] text-muted-foreground hover:text-foreground rounded-md hover-elevate"
            >
              <BookOpen className="w-3.5 h-3.5" />
              API docs
            </a>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              data-testid="button-open-settings"
              className="gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </Button>
          </div>
        </div>
        {/* Mobile nav */}
        <nav className="md:hidden border-t border-border px-6 py-2 flex items-center gap-1 overflow-x-auto" aria-label="Primary mobile">
          {NAV.map((item) => {
            const active = loc === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 text-[13px] rounded-md whitespace-nowrap ${
                  active ? 'text-foreground font-medium bg-accent' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border mt-12">
        <div className="max-w-[1280px] mx-auto px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
          <div>
            InsightDraft · A chain-of-agents PRD studio · Built as a portfolio
            project for senior AI product managers.
          </div>
          <div className="font-mono text-[11px]">
            claude-sonnet-4-20250514
          </div>
        </div>
      </footer>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
