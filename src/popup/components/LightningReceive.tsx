import { useState, useEffect, useRef } from 'react';
import type { MintConfig, PendingMintQuote } from '../../shared/types';
import { QRCode } from './QRCode';
import { formatAmount } from '../../shared/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, AlertCircle, Clock } from 'lucide-react';

interface LightningReceiveProps {
  mints: MintConfig[];
  displayFormat: 'symbol' | 'text';
  onSuccess: () => void;
  onClose: () => void;
}

export function LightningReceive({ mints, displayFormat, onSuccess, onClose }: LightningReceiveProps) {
  const [amount, setAmount] = useState('');
  const [selectedMint, setSelectedMint] = useState(mints.filter(m => m.enabled)[0]?.url || '');
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<PendingMintQuote | null>(null);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'paid' | 'minting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pollingRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (status === 'error' || status === 'success') {
          handleReset();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, onClose]);

  const enabledMints = mints.filter((m) => m.enabled);

  const handleCreateInvoice = async () => {
    const amountNum = parseInt(amount, 10);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'CREATE_MINT_QUOTE',
        mintUrl: selectedMint,
        amount: amountNum,
      });

      if (result.success && result.quote) {
        setQuote(result.quote);
        setStatus('waiting');
        startPolling(result.quote.quoteId, amountNum);
      } else {
        setError(result.error || 'Failed to create invoice');
      }
    } catch {
      setError('Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (quoteId: string, amountNum: number) => {
    pollingRef.current = window.setInterval(async () => {
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'CHECK_MINT_QUOTE',
          mintUrl: selectedMint,
          quoteId,
        });

        if (result.paid) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }

          setStatus('minting');

          const mintResult = await chrome.runtime.sendMessage({
            type: 'MINT_PROOFS',
            mintUrl: selectedMint,
            amount: amountNum,
            quoteId,
          });

          if (mintResult.success) {
            setStatus('success');
            setTimeout(() => {
              onSuccess();
            }, 1500);
          } else {
            setStatus('error');
            setError(mintResult.error || 'Failed to mint proofs');
          }
        }
      } catch {
        // Continue polling on error
      }
    }, 3000);
  };

  const copyToClipboard = async () => {
    if (quote?.invoice) {
      await navigator.clipboard.writeText(quote.invoice);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReset = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setQuote(null);
    setStatus('idle');
    setError(null);
    setAmount('');
  };

  // Show invoice and status
  if (quote && status !== 'idle') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-xl font-semibold text-primary text-center">
          {formatAmount(quote.amount, displayFormat)}
        </p>

        <div className="flex flex-col items-center gap-3 p-4 bg-[#252542] rounded-xl">
          <QRCode value={quote.invoice} size={180} />
          <div className="text-[10px] text-muted-foreground break-all max-h-[60px] overflow-auto p-2 bg-[#1a1a2e] rounded-md w-full">
            {quote.invoice}
          </div>
          <Button variant="secondary" size="sm" onClick={copyToClipboard}>
            {copied ? <><Check className="h-3 w-3 mr-1" /> Copied!</> : 'Copy Invoice'}
          </Button>
        </div>

        {status === 'waiting' && (
          <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-500 text-sm">
            <Clock className="h-4 w-4 animate-pulse" />
            Waiting for payment...
          </div>
        )}

        {status === 'minting' && (
          <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Payment received! Minting proofs...
          </div>
        )}

        {status === 'success' && (
          <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500 text-sm">
            <Check className="h-4 w-4" />
            Success! Proofs minted.
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error || 'An error occurred'}
          </div>
        )}

        {(status === 'error' || status === 'success') && (
          <Button variant="secondary" onClick={handleReset}>
            {status === 'error' ? 'Try Again' : 'Done'}
          </Button>
        )}

        {status === 'waiting' && (
          <Button variant="secondary" onClick={onClose}>
            Cancel
            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
              Esc
            </Badge>
          </Button>
        )}
      </div>
    );
  }

  // Show form
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label className="text-muted-foreground">Amount (sats)</Label>
        <Input
          type="number"
          placeholder="Enter amount..."
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="1"
          className="bg-[#252542] border-[#374151]"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground">Mint</Label>
        <Select value={selectedMint} onValueChange={setSelectedMint}>
          <SelectTrigger className="bg-[#252542] border-[#374151]">
            <SelectValue placeholder="Select a mint" />
          </SelectTrigger>
          <SelectContent className="bg-[#252542] border-[#374151]">
            {enabledMints.map((mint) => (
              <SelectItem key={mint.url} value={mint.url}>
                {mint.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <Button
        className="bg-green-500 hover:bg-green-600"
        onClick={handleCreateInvoice}
        disabled={loading || !amount}
      >
        {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating...</> : 'Generate Invoice'}
      </Button>

      <Button variant="secondary" onClick={onClose}>
        Cancel
        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
          Esc
        </Badge>
      </Button>
    </div>
  );
}

export default LightningReceive;
