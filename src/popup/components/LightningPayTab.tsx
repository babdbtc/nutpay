import type { MeltQuoteInfo } from '../../shared/types';
import type { LnurlPayParams } from '@/hooks/useSendFlow';
import { formatAmount } from '../../shared/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, AlertCircle, Zap } from 'lucide-react';

interface LightningPayTabProps {
  success: boolean;
  meltQuote: MeltQuoteInfo | null;
  setMeltQuote: (v: MeltQuoteInfo | null) => void;
  setResolvedInvoice: (v: string | null) => void;
  lnurlParams: LnurlPayParams | null;
  setLnurlParams: (v: LnurlPayParams | null) => void;
  lnurlAmount: string;
  setLnurlAmount: (v: string) => void;
  lnurlComment: string;
  setLnurlComment: (v: string) => void;
  invoice: string;
  setInvoice: (v: string) => void;
  loading: boolean;
  error: string | null;
  setError: (v: string | null) => void;
  inputType: 'lightning-address' | 'bolt11' | 'unknown';
  selectedBalance: number;
  displayFormat: 'symbol' | 'text';
  onSuccess: () => void;
  handleGetQuote: () => void;
  handleLnurlPay: () => void;
  handlePayInvoice: () => void;
}

export function LightningPayTab({
  success,
  meltQuote,
  setMeltQuote,
  setResolvedInvoice,
  lnurlParams,
  setLnurlParams,
  lnurlAmount,
  setLnurlAmount,
  lnurlComment,
  setLnurlComment,
  invoice,
  setInvoice,
  loading,
  error,
  setError,
  inputType,
  selectedBalance,
  displayFormat,
  onSuccess,
  handleGetQuote,
  handleLnurlPay,
  handlePayInvoice,
}: LightningPayTabProps) {
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

  if (meltQuote) {
    return (
      <div className="flex flex-col gap-4">
        {lnurlParams && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm">
            <Zap className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {lnurlParams.lightningAddress || lnurlParams.domain}
            </span>
          </div>
        )}

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

        <p className="text-xs text-muted-foreground text-center -mt-2">
          Any unused fee reserve will be returned to your wallet
        </p>

        {meltQuote.amount + meltQuote.fee > selectedBalance && (
          <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-yellow-500/10 text-yellow-500 text-xs">
            <AlertCircle className="h-3 w-3 shrink-0" />
            Insufficient balance — need {formatAmount(meltQuote.amount + meltQuote.fee, displayFormat)}, have {formatAmount(selectedBalance, displayFormat)}
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => { setMeltQuote(null); setResolvedInvoice(null); }}
            disabled={loading}
          >
            Cancel
            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
              Esc
            </Badge>
          </Button>
          <Button className="flex-1" onClick={handlePayInvoice} disabled={loading}>
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Paying...</>
              : <>
                  Confirm Payment
                  <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
                    Enter
                  </Badge>
                </>
            }
          </Button>
        </div>
      </div>
    );
  }

  if (lnurlParams) {
    const minSats = Math.ceil(lnurlParams.minSendable / 1000);
    const maxSats = Math.floor(lnurlParams.maxSendable / 1000);
    const isFixedAmount = minSats === maxSats;

    return (
      <div className="flex flex-col gap-4">
        <Card className="bg-card border-0">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium text-white truncate">
                {lnurlParams.lightningAddress || lnurlParams.domain}
              </span>
            </div>
            {lnurlParams.description && (
              <p className="text-xs text-muted-foreground pl-6">
                {lnurlParams.description}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Amount (sats)</Label>
          <Input
            type="number"
            placeholder={isFixedAmount ? `${minSats} sats (fixed)` : `${minSats} - ${maxSats} sats`}
            value={lnurlAmount}
            onChange={(e) => setLnurlAmount(e.target.value)}
            min={minSats}
            max={Math.min(maxSats, selectedBalance)}
            className="bg-card border-input"
            disabled={isFixedAmount}
          />
          {!isFixedAmount && (
            <p className="text-xs text-muted-foreground">
              Range: {minSats.toLocaleString()} - {maxSats.toLocaleString()} sats
            </p>
          )}
        </div>

        {lnurlParams.commentAllowed && lnurlParams.commentAllowed > 0 && (
          <div className="space-y-2">
            <Label className="text-muted-foreground">Comment (optional)</Label>
            <Input
              type="text"
              placeholder="Add a comment..."
              value={lnurlComment}
              onChange={(e) => setLnurlComment(e.target.value.slice(0, lnurlParams.commentAllowed!))}
              maxLength={lnurlParams.commentAllowed}
              className="bg-card border-input"
            />
            <p className="text-xs text-muted-foreground text-right">
              {lnurlComment.length}/{lnurlParams.commentAllowed}
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => { setLnurlParams(null); setLnurlAmount(''); setLnurlComment(''); setError(null); }}
            disabled={loading}
          >
            Back
            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
              Esc
            </Badge>
          </Button>
          <Button className="flex-1" onClick={handleLnurlPay} disabled={loading || !lnurlAmount}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</> : 'Continue'}
          </Button>
        </div>
      </div>
    );
  }

  const getLightningHint = () => {
    if (!invoice.trim()) return null;
    if (inputType === 'lightning-address') {
      return <span className="text-primary">Lightning address detected</span>;
    }
    if (inputType === 'bolt11') {
      return <span className="text-muted-foreground">Bolt11 invoice</span>;
    }
    return null;
  };

  const getLightningButtonText = () => {
    if (loading) {
      const label = inputType === 'lightning-address' ? 'Resolving...' : 'Getting Quote...';
      return <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {label}</>;
    }
    if (inputType === 'lightning-address') {
      return 'Resolve Address';
    }
    return 'Get Quote';
  };

  const hint = getLightningHint();

  return (
    <>
      <div className="space-y-2">
        <Label className="text-muted-foreground">Invoice or Lightning Address</Label>
        <Textarea
          placeholder="lnbc... or user@domain.com"
          value={invoice}
          onChange={(e) => setInvoice(e.target.value)}
          className="bg-card border-input min-h-[80px]"
        />
        {hint && <p className="text-xs">{hint}</p>}
      </div>

      {error && (
        <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <Button className="w-full" onClick={handleGetQuote} disabled={loading || !invoice.trim()}>
        {getLightningButtonText()}
      </Button>
    </>
  );
}
