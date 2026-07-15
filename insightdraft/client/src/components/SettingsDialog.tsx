import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { safeStorage } from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Trash2, KeyRound } from 'lucide-react';

const KEY_STORAGE = 'insightdraft.apiKey.v1';

export function getStoredKey(): string {
  return safeStorage.get(KEY_STORAGE) ?? '';
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setKey(getStoredKey());
  }, [open]);

  function save() {
    const trimmed = key.trim();
    if (trimmed && !trimmed.startsWith('sk-ant-')) {
      toast({
        title: 'Key looks unusual',
        description: "Anthropic keys typically start with 'sk-ant-'. Saved anyway.",
      });
    }
    safeStorage.set(KEY_STORAGE, trimmed);
    toast({ title: 'Saved', description: 'API key updated locally.' });
    onOpenChange(false);
  }

  function clear() {
    safeStorage.remove(KEY_STORAGE);
    setKey('');
    toast({ title: 'Cleared', description: 'API key removed from local storage.' });
  }

  const persistent = safeStorage.isPersistent();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]" data-testid="dialog-settings">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            API key
          </DialogTitle>
          <DialogDescription>
            Used directly from your browser to call the Anthropic Messages API.
            Never sent to any server we control. Stored only in your{' '}
            {persistent ? 'browser localStorage' : 'in-memory session'} on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="anthropic-key" className="text-[13px] font-medium">
              Anthropic API key
            </Label>
            <div className="relative">
              <Input
                id="anthropic-key"
                data-testid="input-anthropic-key"
                type={reveal ? 'text' : 'password'}
                placeholder="sk-ant-..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="pr-10 font-mono text-[13px]"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? 'Hide key' : 'Show key'}
                data-testid="button-toggle-key-visibility"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Browser CORS may block direct calls to api.anthropic.com. If that
              happens, the app falls back to a clear error state and you can use{' '}
              <span className="font-medium text-foreground">Demo Mode</span> to
              walk the full pipeline.
            </p>
          </div>

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">Model:</span>{' '}
            <span className="font-mono">claude-sonnet-4-20250514</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={clear}
            data-testid="button-clear-key"
            className="text-muted-foreground gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-settings">
            Cancel
          </Button>
          <Button onClick={save} data-testid="button-save-settings">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
