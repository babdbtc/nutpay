import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, KeyRound, Wallet } from 'lucide-react';
import type { RecoveryMode } from '@/hooks/useRecovery';

interface SeedImportStepProps {
  recoveryMode: RecoveryMode;
  setRecoveryMode: (mode: RecoveryMode) => void;
  recoveryPhrase: string;
  setRecoveryPhrase: (phrase: string) => void;
  error: string | null;
  loading: boolean;
  onVerify: () => void;
  onBack: () => void;
}

export function SeedImportStep({
  recoveryMode,
  setRecoveryMode,
  recoveryPhrase,
  setRecoveryPhrase,
  error,
  loading,
  onVerify,
  onBack,
}: SeedImportStepProps) {
  return (
    <div className="popup-container bg-background p-6 flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-white">Wallet Recovery</h2>
        <p className="text-sm text-muted-foreground text-center">
          Enter your 12-word seed phrase
        </p>
      </div>

      <div className="space-y-2">
        <Label>What would you like to recover?</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={recoveryMode === 'pin_reset' ? 'default' : 'outline'}
            onClick={() => setRecoveryMode('pin_reset')}
            className="h-auto py-3"
          >
            <div className="text-center">
              <KeyRound className="h-4 w-4 mx-auto mb-1" />
              <div className="text-xs">Reset PIN</div>
            </div>
          </Button>
          <Button
            variant={recoveryMode === 'wallet_restore' ? 'default' : 'outline'}
            onClick={() => setRecoveryMode('wallet_restore')}
            className="h-auto py-3"
          >
            <div className="text-center">
              <Wallet className="h-4 w-4 mx-auto mb-1" />
              <div className="text-xs">Restore Wallet</div>
            </div>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {recoveryMode === 'pin_reset'
            ? 'Reset your PIN/password without scanning for funds'
            : 'Scan mints to recover your ecash balance'}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Recovery Phrase</Label>
        <Textarea
          placeholder="Enter your 12 words separated by spaces..."
          value={recoveryPhrase}
          onChange={(e) => setRecoveryPhrase(e.target.value)}
          className="bg-card border-input min-h-[100px]"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <Button onClick={onVerify} disabled={loading}>
        {loading ? 'Verifying...' : 'Continue'}
        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
          Enter
        </Badge>
      </Button>

      <Button variant="ghost" onClick={onBack} className="text-muted-foreground">
        Back to Login
        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
          Esc
        </Badge>
      </Button>
    </div>
  );
}
