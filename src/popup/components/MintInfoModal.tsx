import { useState, useEffect } from 'react';
import { formatAmount } from '../../shared/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle } from 'lucide-react';

interface MintInfoModalProps {
  mintUrl: string;
  mintName: string;
  displayFormat: 'symbol' | 'text';
  onClose: () => void;
  onConsolidate?: () => void;
}

interface MintDetails {
  name: string;
  version?: string;
  description?: string;
  contact?: string[];
  motd?: string;
  nuts?: Record<string, unknown>;
  online: boolean;
}

interface BalanceDetails {
  balance: number;
  proofCount: number;
  denominations: Record<number, number>;
}

export function MintInfoModal({
  mintUrl,
  mintName,
  displayFormat,
  onClose,
  onConsolidate,
}: MintInfoModalProps) {
  const [loading, setLoading] = useState(true);
  const [mintInfo, setMintInfo] = useState<MintDetails | null>(null);
  const [balanceDetails, setBalanceDetails] = useState<BalanceDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consolidating, setConsolidating] = useState(false);

  useEffect(() => {
    loadMintInfo();
  }, [mintUrl]);

  const loadMintInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      const [infoResult, balanceResult] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_MINT_INFO', mintUrl }),
        chrome.runtime.sendMessage({ type: 'GET_MINT_BALANCE_DETAILS', mintUrl }),
      ]);

      setMintInfo(infoResult);
      setBalanceDetails(balanceResult);
    } catch {
      setError('Failed to load mint information');
    } finally {
      setLoading(false);
    }
  };

  const handleConsolidate = async () => {
    if (onConsolidate) {
      setConsolidating(true);
      await onConsolidate();
      setConsolidating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">Loading mint information...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  const sortedDenoms = balanceDetails?.denominations
    ? Object.entries(balanceDetails.denominations)
        .map(([denom, count]) => ({ denom: parseInt(denom), count }))
        .sort((a, b) => b.denom - a.denom)
    : [];

  return (
    <div className="flex flex-col gap-4">
      {/* Header with status */}
      <div className="flex items-center gap-3">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            mintInfo?.online ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        <span className="text-base font-semibold text-white flex-1">
          {mintInfo?.name || mintName}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground break-all">{mintUrl}</p>

      {/* Balance Section */}
      <Card className="bg-card border-0">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-2">Balance</p>
          <p className="text-2xl font-bold text-primary text-center py-2">
            {formatAmount(balanceDetails?.balance || 0, displayFormat)}
          </p>
          <div className="flex justify-between py-2 border-t border-[#333]">
            <span className="text-sm text-muted-foreground">Proofs</span>
            <span className="text-sm text-white font-medium">
              {balanceDetails?.proofCount || 0}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Denominations */}
      {sortedDenoms.length > 0 && (
        <Card className="bg-card border-0">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-3">Denominations</p>
            <div className="flex flex-wrap gap-1.5">
              {sortedDenoms.map(({ denom, count }) => (
                <Badge
                  key={denom}
                  variant="secondary"
                  className="bg-popover text-muted-foreground text-[11px] font-normal"
                >
                  {denom} x{count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mint Info */}
      {mintInfo && (
        <Card className="bg-card border-0">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground mb-2">Mint Info</p>
            {mintInfo.version && (
              <div className="flex justify-between py-1.5 border-b border-[#333]">
                <span className="text-sm text-muted-foreground">Version</span>
                <span className="text-sm text-white font-medium">{mintInfo.version}</span>
              </div>
            )}
            <div className="flex justify-between py-1.5">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className="text-sm text-white font-medium">
                {mintInfo.online ? 'Online' : 'Offline'}
              </span>
            </div>
            {mintInfo.motd && (
              <p className="text-xs text-muted-foreground italic p-2 bg-popover rounded-md mt-2">
                {mintInfo.motd}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {balanceDetails && balanceDetails.proofCount > 5 && (
          <Button
            className="flex-1"
            onClick={handleConsolidate}
            disabled={consolidating}
          >
            {consolidating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Consolidating...
              </>
            ) : (
              'Consolidate Proofs'
            )}
          </Button>
        )}
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

export default MintInfoModal;
