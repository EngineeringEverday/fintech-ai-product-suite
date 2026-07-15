import { Switch, Route, Router } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Studio } from '@/pages/Studio';
import { EvalFramework } from '@/pages/EvalFramework';
import { Privacy } from '@/pages/Privacy';
import { AppShell } from '@/components/AppShell';

function AppRouter() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Studio} />
        <Route path="/evals" component={EvalFramework} />
        <Route path="/privacy" component={Privacy} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
