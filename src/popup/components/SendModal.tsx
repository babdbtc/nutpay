import type { MintConfig } from '../../shared/types';
import { formatAmount } from '../../shared/format';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useSendFlow } from '@/hooks/useSendFlow';
import { EcashSendTab } from './EcashSendTab';
import { LightningPayTab } from './LightningPayTab';

interface SendModalProps {
  mints: MintConfig[];
  balances: Map<string, number>;
  displayFormat: 'symbol' | 'text';
  onSuccess: () => void;
  onClose: () => void;
}

export function SendModal({ mints, balances, displayFormat, onSuccess, onClose }: SendModalProps) {
  const flow = useSendFlow({ mints, balances, onSuccess, onClose });

  if (flow.generatedToken) {
    return (
      <EcashSendTab
        generatedToken={flow.generatedToken}
        amount={flow.amount}
        setAmount={flow.setAmount}
        selectedBalance={flow.selectedBalance}
        loading={flow.loading}
        error={flow.error}
        copied={flow.copied}
        onSuccess={onSuccess}
        handleGenerateToken={flow.handleGenerateToken}
        copyToClipboard={flow.copyToClipboard}
      />
    );
  }

  if (flow.success || flow.meltQuote || flow.lnurlParams) {
    return (
      <LightningPayTab
        success={flow.success}
        meltQuote={flow.meltQuote}
        setMeltQuote={flow.setMeltQuote}
        setResolvedInvoice={flow.setResolvedInvoice}
        lnurlParams={flow.lnurlParams}
        setLnurlParams={flow.setLnurlParams}
        lnurlAmount={flow.lnurlAmount}
        setLnurlAmount={flow.setLnurlAmount}
        lnurlComment={flow.lnurlComment}
        setLnurlComment={flow.setLnurlComment}
        invoice={flow.invoice}
        setInvoice={flow.setInvoice}
        loading={flow.loading}
        error={flow.error}
        setError={flow.setError}
        inputType={flow.inputType}
        selectedBalance={flow.selectedBalance}
        displayFormat={displayFormat}
        onSuccess={onSuccess}
        handleGetQuote={flow.handleGetQuote}
        handleLnurlPay={flow.handleLnurlPay}
        handlePayInvoice={flow.handlePayInvoice}
      />
    );
  }

  return (
    <Tabs defaultValue="ecash" className="w-full" onValueChange={flow.handleTabChange}>
      <TabsList className="grid w-full grid-cols-2 bg-card">
        <TabsTrigger value="ecash">Ecash</TabsTrigger>
        <TabsTrigger value="lightning">Lightning</TabsTrigger>
      </TabsList>

      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label className="text-muted-foreground">From Mint</Label>
          <Select value={flow.selectedMint} onValueChange={flow.setSelectedMint}>
            <SelectTrigger className="bg-card border-input">
              <SelectValue placeholder="Select a mint" />
            </SelectTrigger>
            <SelectContent className="bg-card border-input">
              {flow.enabledMints.map((mint) => (
                <SelectItem key={mint.url} value={mint.url}>
                  {mint.name} ({formatAmount(balances.get(mint.url) || 0, displayFormat)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Available: {formatAmount(flow.selectedBalance, displayFormat)}
          </p>
        </div>

        <TabsContent value="ecash" className="mt-0 space-y-4">
          <EcashSendTab
            generatedToken={flow.generatedToken}
            amount={flow.amount}
            setAmount={flow.setAmount}
            selectedBalance={flow.selectedBalance}
            loading={flow.loading}
            error={flow.error}
            copied={flow.copied}
            onSuccess={onSuccess}
            handleGenerateToken={flow.handleGenerateToken}
            copyToClipboard={flow.copyToClipboard}
          />
        </TabsContent>

        <TabsContent value="lightning" className="mt-0 space-y-4">
          <LightningPayTab
            success={flow.success}
            meltQuote={flow.meltQuote}
            setMeltQuote={flow.setMeltQuote}
            setResolvedInvoice={flow.setResolvedInvoice}
            lnurlParams={flow.lnurlParams}
            setLnurlParams={flow.setLnurlParams}
            lnurlAmount={flow.lnurlAmount}
            setLnurlAmount={flow.setLnurlAmount}
            lnurlComment={flow.lnurlComment}
            setLnurlComment={flow.setLnurlComment}
            invoice={flow.invoice}
            setInvoice={flow.setInvoice}
            loading={flow.loading}
            error={flow.error}
            setError={flow.setError}
            inputType={flow.inputType}
            selectedBalance={flow.selectedBalance}
            displayFormat={displayFormat}
            onSuccess={onSuccess}
            handleGetQuote={flow.handleGetQuote}
            handleLnurlPay={flow.handleLnurlPay}
            handlePayInvoice={flow.handlePayInvoice}
          />
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
