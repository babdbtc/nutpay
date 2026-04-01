import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Loader2, Check, X } from 'lucide-react';
import type { RecoveryProgress, MintConfig } from '../../shared/types';

interface MintScannerStepProps {
  step: 'selectMints' | 'recovering' | 'results';
  availableMints: MintConfig[];
  selectedMints: Set<string>;
  setSelectedMints: (value: Set<string> | ((prevState: Set<string>) => Set<string>)) => void;
  customMintUrl: string;
  setCustomMintUrl: (url: string) => void;
  error: string | null;
  loading: boolean;
  recoveryProgress: RecoveryProgress[];
  recoveryResult: {
    totalRecovered: number;
    mintResults: Array<{ mintUrl: string; amount: number; proofCount: number }>;
  } | null;
  authType: 'pin' | 'password';
  onAddCustomMint: () => void;
  onStartRecovery: () => void;
  onCancelRecovery: () => void;
  onFinishRecovery: () => void;
  onBackToPhrase: () => void;
}

export function MintScannerStep({
  step,
  availableMints,
  selectedMints,
  setSelectedMints,
  customMintUrl,
  setCustomMintUrl,
  error,
  loading,
  recoveryProgress,
  recoveryResult,
  authType,
  onAddCustomMint,
  onStartRecovery,
  onCancelRecovery,
  onFinishRecovery,
  onBackToPhrase,
}: MintScannerStepProps) {
  if (step === 'selectMints') {
    return (
      <div className="popup-container bg-background p-6 flex flex-col gap-4">
        <div className="text-center mb-2">
          <h2 className="text-lg font-semibold text-white">Select Mints</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which mints to scan for recoverable funds
          </p>
        </div>

        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {availableMints.map((mint) => (
            <label
              key={mint.url}
              className="flex items-center gap-3 p-3 rounded-lg bg-card cursor-pointer hover:bg-card/80"
            >
              <Checkbox
                checked={selectedMints.has(mint.url)}
                onCheckedChange={(checked) => {
                  setSelectedMints((prev) => {
                    const next = new Set(prev);
                    if (checked) {
                      next.add(mint.url);
                    } else {
                      next.delete(mint.url);
                    }
                    return next;
                  });
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{mint.name}</div>
                <div className="text-xs text-muted-foreground truncate">{mint.url}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Add custom mint URL..."
            value={customMintUrl}
            onChange={(e) => setCustomMintUrl(e.target.value)}
            className="bg-card border-input"
          />
          <Button variant="secondary" onClick={onAddCustomMint}>
            Add
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Button onClick={onStartRecovery} disabled={loading || selectedMints.size === 0}>
          {loading ? 'Starting...' : `Scan ${selectedMints.size} Mint${selectedMints.size !== 1 ? 's' : ''}`}
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Enter
          </Badge>
        </Button>

        <Button variant="ghost" onClick={onBackToPhrase} className="text-muted-foreground">
          Back
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Esc
          </Badge>
        </Button>
      </div>
    );
  }

  if (step === 'recovering') {
    return (
      <div className="popup-container bg-background p-6 flex flex-col gap-4">
        <div className="text-center mb-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <h2 className="text-lg font-semibold text-white">Recovering Wallet</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Scanning mints for your ecash...
          </p>
        </div>

        <div className="space-y-2">
          {recoveryProgress.map((progress) => (
            <div key={progress.mintUrl} className="p-3 rounded-lg bg-card">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-white truncate max-w-[200px]">
                  {progress.mintUrl.replace(/^https?:\/\//, '')}
                </span>
                {progress.status === 'scanning' && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                {progress.status === 'found' && (
                  <span className="text-green-400 text-xs">Found!</span>
                )}
                {progress.status === 'complete' && (
                  <Check className="h-4 w-4 text-green-400" />
                )}
                {progress.status === 'error' && (
                  <X className="h-4 w-4 text-red-400" />
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {progress.status === 'scanning' && `Scanning counter ${progress.currentCounter}...`}
                {progress.status === 'found' &&
                  `Found ${progress.proofsFound} proofs (${progress.totalAmount} sats)`}
                {progress.status === 'complete' &&
                  (progress.totalAmount > 0
                    ? `Recovered ${progress.totalAmount} sats`
                    : 'No funds found')}
                {progress.status === 'error' && progress.errorMessage}
              </div>
            </div>
          ))}
        </div>

        <Button variant="secondary" onClick={onCancelRecovery}>
          Cancel
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Esc
          </Badge>
        </Button>
      </div>
    );
  }

  return (
    <div className="popup-container bg-background p-6 flex flex-col gap-4">
      <div className="text-center mb-2">
        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-2">
          <Check className="h-6 w-6 text-green-400" />
        </div>
        <h2 className="text-lg font-semibold text-white">Recovery Complete</h2>
        {recoveryResult && recoveryResult.totalRecovered > 0 ? (
          <p className="text-2xl font-bold text-primary mt-2">
            {recoveryResult.totalRecovered} sats
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mt-2">
            No funds found on selected mints
          </p>
        )}
      </div>

      {recoveryResult && recoveryResult.mintResults.length > 0 && (
        <div className="space-y-2">
          {recoveryResult.mintResults.map((result) => (
            <div key={result.mintUrl} className="p-3 rounded-lg bg-card">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white truncate max-w-[180px]">
                  {result.mintUrl.replace(/^https?:\/\//, '')}
                </span>
                <span className="text-sm font-medium text-primary">
                  {result.amount} sats
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {result.proofCount} proofs
              </div>
            </div>
          ))}
        </div>
      )}

      <Button onClick={onFinishRecovery}>
        Set New {authType === 'pin' ? 'PIN' : 'Password'}
        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
          Enter
        </Badge>
      </Button>
    </div>
  );
}
