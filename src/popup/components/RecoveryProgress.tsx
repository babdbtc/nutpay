import { Loader2, Check, X, AlertCircle } from 'lucide-react';
import type { RecoveryProgress as RecoveryProgressType } from '../../shared/types';

interface RecoveryProgressProps {
  progress: RecoveryProgressType[];
  title?: string;
  subtitle?: string;
}

export function RecoveryProgress({ progress, title, subtitle }: RecoveryProgressProps) {
  const totalRecovered = progress.reduce((sum, p) => sum + p.totalAmount, 0);
  const totalProofs = progress.reduce((sum, p) => sum + p.proofsFound, 0);
  const isScanning = progress.some((p) => p.status === 'scanning');

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="text-center">
        {isScanning ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
        ) : totalRecovered > 0 ? (
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-2">
            <Check className="h-6 w-6 text-green-400" />
          </div>
        ) : (
          <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center mx-auto mb-2">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <h2 className="text-lg font-semibold text-white">
          {title || (isScanning ? 'Recovering Wallet' : 'Recovery Complete')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {subtitle || (isScanning ? 'Scanning mints for your ecash...' : `Found ${totalProofs} proofs`)}
        </p>
        {totalRecovered > 0 && (
          <p className="text-2xl font-bold text-primary mt-2">{totalRecovered} sats</p>
        )}
      </div>

      {/* Mint progress list */}
      <div className="space-y-2">
        {progress.map((item) => (
          <MintProgressItem key={item.mintUrl} progress={item} />
        ))}
      </div>
    </div>
  );
}

interface MintProgressItemProps {
  progress: RecoveryProgressType;
}

function MintProgressItem({ progress }: MintProgressItemProps) {
  const displayUrl = progress.mintUrl.replace(/^https?:\/\//, '');

  return (
    <div className="p-3 rounded-lg bg-card">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-white truncate max-w-[200px]">{displayUrl}</span>
        <StatusIndicator status={progress.status} />
      </div>
      <div className="text-xs text-muted-foreground">
        <StatusMessage progress={progress} />
      </div>
      {progress.status === 'scanning' && (
        <div className="mt-2">
          <div className="h-1 bg-popover rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${Math.min((progress.currentCounter / 1000) * 100, 100)}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface StatusIndicatorProps {
  status: RecoveryProgressType['status'];
}

function StatusIndicator({ status }: StatusIndicatorProps) {
  switch (status) {
    case 'scanning':
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case 'found':
      return <span className="text-green-400 text-xs font-medium">Found!</span>;
    case 'complete':
      return <Check className="h-4 w-4 text-green-400" />;
    case 'error':
      return <X className="h-4 w-4 text-red-400" />;
    default:
      return null;
  }
}

interface StatusMessageProps {
  progress: RecoveryProgressType;
}

function StatusMessage({ progress }: StatusMessageProps) {
  switch (progress.status) {
    case 'scanning':
      return <>Scanning counter {progress.currentCounter}...</>;
    case 'found':
      return (
        <>
          Found {progress.proofsFound} proofs ({progress.totalAmount} sats)
        </>
      );
    case 'complete':
      return progress.totalAmount > 0 ? (
        <>
          Recovered {progress.totalAmount} sats ({progress.proofsFound} proofs)
        </>
      ) : (
        <>No funds found</>
      );
    case 'error':
      return <span className="text-red-400">{progress.errorMessage || 'Recovery failed'}</span>;
    default:
      return null;
  }
}

export default RecoveryProgress;
