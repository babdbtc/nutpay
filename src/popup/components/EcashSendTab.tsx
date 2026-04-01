import { QRCode } from './QRCode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, AlertCircle, Copy } from 'lucide-react';

interface EcashSendTabProps {
  generatedToken: string | null;
  amount: string;
  setAmount: (v: string) => void;
  selectedBalance: number;
  loading: boolean;
  error: string | null;
  copied: boolean;
  onSuccess: () => void;
  handleGenerateToken: () => void;
  copyToClipboard: () => void;
}

export function EcashSendTab({
  generatedToken,
  amount,
  setAmount,
  selectedBalance,
  loading,
  error,
  copied,
  onSuccess,
  handleGenerateToken,
  copyToClipboard,
}: EcashSendTabProps) {
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

  return (
    <>
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
    </>
  );
}
