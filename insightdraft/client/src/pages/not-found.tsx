import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="max-w-[680px] mx-auto px-6 py-24 text-center">
      <div className="text-[12px] font-mono text-muted-foreground tracking-wider uppercase mb-3">
        404
      </div>
      <h1 className="font-display text-[40px] sm:text-[48px] leading-tight tracking-tight">
        That page does not exist.
      </h1>
      <p className="mt-3 text-[14.5px] text-muted-foreground max-w-[44ch] mx-auto">
        Either the route was removed or the link is stale. Head back to the Studio
        to start a new draft.
      </p>
      <div className="mt-6">
        <Link href="/">
          <Button data-testid="button-back-to-studio">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Studio
          </Button>
        </Link>
      </div>
    </div>
  );
}
