import { useState, useEffect } from 'react';
import type { Settings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { formatAmount } from '../shared/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface PaymentDetails {
  requestId: string;
  origin: string;
  mint: string;
  amount: number;
  unit: string;
  balance: number;
}

function Approval() {
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [rememberSite, setRememberSite] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDetails({
      requestId: params.get('requestId') || '',
      origin: params.get('origin') || '',
      mint: params.get('mint') || '',
      amount: parseInt(params.get('amount') || '0', 10),
      unit: params.get('unit') || 'sat',
      balance: parseInt(params.get('balance') || '0', 10),
    });

    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }).then((data) => {
      if (data) setSettings(data);
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleDeny();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const sendResponse = (approved: boolean) => {
    if (!details) return;

    chrome.runtime.sendMessage({
      type: 'APPROVAL_RESPONSE',
      requestId: details.requestId,
      approved,
      rememberSite,
    });

    window.close();
  };

  const handleApprove = () => sendResponse(true);
  const handleDeny = () => sendResponse(false);

  if (!details) {
    return (
      <div className="approval-container bg-[#16162a] min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  const mintHost = (() => {
    try {
      return new URL(details.mint).hostname;
    } catch {
      return details.mint;
    }
  })();

  const siteHost = (() => {
    try {
      return new URL(details.origin).hostname;
    } catch {
      return details.origin;
    }
  })();

  const remainingBalance = details.balance - details.amount;

  return (
    <div className="approval-container bg-[#16162a] min-h-screen text-white flex flex-col gap-4">
      {/* Header */}
      <div className="text-center mb-2">
        <h1 className="text-lg font-semibold mb-1">Payment Request</h1>
        <p className="text-sm text-muted-foreground">A site is requesting payment</p>
      </div>

      {/* Payment Details Card */}
      <Card className="bg-[#252542] border-0">
        <CardContent className="p-4">
          {/* Amount */}
          <p className="text-3xl font-bold text-primary text-center py-4">
            {formatAmount(details.amount, settings.displayFormat)}
          </p>
          <p className="text-center text-xs text-muted-foreground -mt-2 pb-4">
            Balance: {formatAmount(details.balance, settings.displayFormat)} {' '}
            {formatAmount(remainingBalance, settings.displayFormat)} after
          </p>

          {/* Details */}
          <div className="space-y-2">
            <div className="flex justify-between items-center py-2 border-b border-[#333]">
              <span className="text-sm text-muted-foreground">From</span>
              <span className="text-sm font-medium truncate max-w-[200px]" title={details.origin}>
                {siteHost}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Mint</span>
              <span className="text-sm font-medium truncate max-w-[200px]" title={details.mint}>
                {mintHost}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Remember Site Checkbox */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="remember"
          checked={rememberSite}
          onCheckedChange={(checked) => setRememberSite(checked === true)}
        />
        <Label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
          Auto-approve future payments from this site
        </Label>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 mt-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={handleDeny}
        >
          Deny
        </Button>
        <Button
          className="flex-1 bg-green-500 hover:bg-green-600"
          onClick={handleApprove}
        >
          Pay
        </Button>
      </div>

      {/* Timer */}
      <p className="text-center text-xs text-muted-foreground">
        Auto-deny in {timeLeft}s
      </p>
    </div>
  );
}

export default Approval;
