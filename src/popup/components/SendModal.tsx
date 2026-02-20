import { useState, useEffect } from 'react';
import type { MintConfig, MeltQuoteInfo } from '../../shared/types';
import { QRCode } from './QRCode';
import { formatAmount } from '../../shared/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, AlertCircle, Copy } from 'lucide-react';

interface SendModalProps {
  mints: MintConfig[];
  balances: Map<string, number>;
  displayFormat: 'symbol' | 'text';
  onSuccess: () => void;
  onClose: () => void;
}

export function SendModal({ mints, balances, displayFormat, onSuccess, onClose }: SendModalProps) {
  const [amount, setAmount] = useState('');
  const [selectedMint, setSelectedMint] = useState(mints[0]?.url || '');
  const [invoice, setInvoice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [meltQuote, setMeltQuote] = useState<MeltQuoteInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);

  const enabledMints = mints.filter((m) => m.enabled);
  const selectedBalance = balances.get(selectedMint) || 0;

  const handleTabChange = () => {
    setError(null);
    setGeneratedToken(null);
    setMeltQuote(null);
    setSuccess(false);
  };

  const handleGenerateToken = async () => {
    const amountNum = parseInt(amount, 10);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (amountNum > selectedBalance) {
      setError(`Insufficient balance. You have ${selectedBalance} sats from this mint.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'GENERATE_SEND_TOKEN',
        mintUrl: selectedMint,
        amount: amountNum,
      });

      if (result.success && result.token) {
        setGeneratedToken(result.token);
      } else {
        setError(result.error || 'Failed to generate token');
      }
    } catch {
      setError('Failed to generate token');
    } finally {
      setLoading(false);
    }
  };

  const handleGetQuote = async () => {
    if (!invoice.trim()) {
      setError('Please enter a Lightning invoice');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'GET_MELT_QUOTE',
        mintUrl: selectedMint,
        invoice: invoice.trim(),
      });

      if (result.success && result.quote) {
        const total = result.quote.amount + result.quote.fee;
        if (total > selectedBalance) {
          setError(`Insufficient balance. Need ${total} sats (${result.quote.amount} + ${result.quote.fee} fee), have ${selectedBalance} sats.`);
        } else {
          setMeltQuote(result.quote);
        }
      } else {
        setError(result.error || 'Failed to get quote');
      }
    } catch {
      setError('Failed to get quote');
    } finally {
      setLoading(false);
    }
  };

  const handlePayInvoice = async () => {
    if (!meltQuote) return;

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'MELT_PROOFS',
        mintUrl: selectedMint,
        invoice: invoice.trim(),
        quoteId: meltQuote.quote,
        amount: meltQuote.amount,
        feeReserve: meltQuote.fee,
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => onSuccess(), 1500);
      } else {
        setError(result.error || 'Failed to pay invoice');
      }
    } catch {
      setError('Failed to pay invoice');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (generatedToken) {
      await navigator.clipboard.writeText(generatedToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept Enter when typing in textarea (lightning invoice)
      if (e.key === 'Enter' && e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (generatedToken || success) {
          onSuccess();
        } else if (meltQuote && !loading) {
          handlePayInvoice();
        }
        // Don't handle Enter for base form — user may need to tab between fields
        // The ecash amount input and lightning textarea have their own submit flows
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (meltQuote) {
          setMeltQuote(null);
        } else if (generatedToken || success) {
          onSuccess();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [meltQuote, generatedToken, success, loading, onSuccess, onClose]);

  // Show generated token
  if (generatedToken) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500 text-sm">
          <Check className="h-4 w-4" />
          Token generated! Share it with the recipient.
        </div>

        <div className="flex flex-col items-center gap-3 p-4 bg-card rounded-xl">
          <QRCode value={generatedToken} size={180} />
          <div className="text-[10px] text-muted-foreground break-all max-h-[80px] overflow-auto p-2 bg-popover rounded-md w-full">
            {generatedToken}
          </div>
          <Button variant="secondary" size="sm" onClick={copyToClipboard}>
            {copied ? <><Check className="h-3 w-3 mr-1" /> Copied!</> : <><Copy className="h-3 w-3 mr-1" /> Copy Token</>}
          </Button>
        </div>

        <Button onClick={onSuccess}>
          Done
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Enter
          </Badge>
        </Button>
      </div>
    );
  }

  // Show success for Lightning
  if (success) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500 text-sm">
          <Check className="h-4 w-4" />
          Payment sent successfully!
        </div>
        <Button onClick={onSuccess}>
          Done
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Enter
          </Badge>
        </Button>
      </div>
    );
  }

  // Show melt quote confirmation
  if (meltQuote) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="bg-card border-0">
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between py-2 border-b border-[#333]">
              <span className="text-muted-foreground text-sm">Invoice Amount</span>
              <span className="text-white text-sm font-medium">{formatAmount(meltQuote.amount, displayFormat)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#333]">
              <span className="text-muted-foreground text-sm">Fee Reserve</span>
              <span className="text-white text-sm font-medium">{formatAmount(meltQuote.fee, displayFormat)}</span>
            </div>
            <div className="flex justify-between py-2 pt-3 border-t border-[#444]">
              <span className="text-white font-semibold">Total</span>
              <span className="text-primary font-semibold">{formatAmount(meltQuote.amount + meltQuote.fee, displayFormat)}</span>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setMeltQuote(null)} disabled={loading}>
            Cancel
            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
              Esc
            </Badge>
          </Button>
          <Button className="flex-1" onClick={handlePayInvoice} disabled={loading}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Paying...</> : <>
              Confirm Payment
              <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
                Enter
              </Badge>
            </>}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="ecash" className="w-full" onValueChange={handleTabChange}>
      <TabsList className="grid w-full grid-cols-2 bg-card">
        <TabsTrigger value="ecash">Ecash</TabsTrigger>
        <TabsTrigger value="lightning">Lightning</TabsTrigger>
      </TabsList>

      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label className="text-muted-foreground">From Mint</Label>
          <Select value={selectedMint} onValueChange={setSelectedMint}>
            <SelectTrigger className="bg-card border-input">
              <SelectValue placeholder="Select a mint" />
            </SelectTrigger>
            <SelectContent className="bg-card border-input">
              {enabledMints.map((mint) => (
                <SelectItem key={mint.url} value={mint.url}>
                  {mint.name} ({formatAmount(balances.get(mint.url) || 0, displayFormat)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Available: {formatAmount(selectedBalance, displayFormat)}
          </p>
        </div>

        <TabsContent value="ecash" className="mt-0 space-y-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Amount (sats)</Label>
            <Input
              type="number"
              placeholder="Enter amount..."
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              max={selectedBalance}
              className="bg-card border-input"
            />
          </div>

          {error && (
            <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <Button className="w-full" onClick={handleGenerateToken} disabled={loading || !amount}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating...</> : 'Generate Token'}
          </Button>
        </TabsContent>

        <TabsContent value="lightning" className="mt-0 space-y-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Lightning Invoice</Label>
            <Textarea
              placeholder="Paste Lightning invoice (lnbc...)"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              className="bg-card border-input min-h-[80px]"
            />
          </div>

          {error && (
            <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <Button className="w-full" onClick={handleGetQuote} disabled={loading || !invoice.trim()}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Getting Quote...</> : 'Get Quote'}
          </Button>
        </TabsContent>

        <Button variant="secondary" className="w-full" onClick={onClose}>
          Cancel
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Esc
          </Badge>
        </Button>
      </div>
    </Tabs>
  );
}

export default SendModal;
