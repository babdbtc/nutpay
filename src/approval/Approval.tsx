import { useState, useEffect, useCallback, useRef } from 'react';
import type { Settings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { formatAmount } from '../shared/format';
import { applyTheme } from '../shared/theme';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

function AnimatedCheckmark() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="w-20 h-20 rounded-full bg-green-500/20 animate-circle-fill animate-success-pulse flex items-center justify-center">
        <svg
          className="w-10 h-10 text-green-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            className="animate-checkmark-draw"
            d="M4 12l6 6L20 6"
          />
        </svg>
      </div>
    </div>
  );
}

interface PaymentDetails {
  requestId: string;
  origin: string;
  mints: string[];
  amount: number;
  unit: string;
  balance: number;
}

function Approval() {
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [rememberSite, setRememberSite] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [showSuccess, setShowSuccess] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDetails({
      requestId: params.get('requestId') || '',
      origin: params.get('origin') || '',
      mints: (() => {
        const raw = params.get('mints') || '[]';
        try { return JSON.parse(raw) as string[]; } catch { return raw.split(',').filter(Boolean); }
      })(),
      amount: parseInt(params.get('amount') || '0', 10),
      unit: params.get('unit') || 'sat',
      balance: parseInt(params.get('balance') || '0', 10),
    });

    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }).then((data) => {
      if (data) {
        // Merge with defaults to ensure new settings fields have values
        const merged = { ...DEFAULT_SETTINGS, ...data };
        setSettings(merged);
        applyTheme(merged.theme || 'classic');
      }
    });
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Call sendResponse(false) directly instead of handleDeny to avoid stale closure.
          // handleDeny captured from useCallback depends on `details` which may be null
          // when this effect was first set up.
          sendResponse(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [details]);

  const sendResponse = (approved: boolean) => {
    if (!details) return;

    // Clear the auto-deny timer
    if (timerRef.current) clearInterval(timerRef.current);

    chrome.runtime.sendMessage({
      type: 'APPROVAL_RESPONSE',
      requestId: details.requestId,
      approved,
      rememberSite,
    });

    if (approved && settings.enableAnimations) {
      // Show success animation, then close
      setShowSuccess(true);
      setTimeout(() => window.close(), 600);
    } else {
      window.close();
    }
  };

  const handleApprove = useCallback(() => sendResponse(true), [details, rememberSite, settings.enableAnimations]);
  const handleDeny = useCallback(() => sendResponse(false), [details]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!details) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        handleApprove();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleDeny();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [details, handleApprove, handleDeny]);

  if (!details) {
    return (
      <div className="approval-container bg-background min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  const mintHosts = details.mints.map((m) => {
    try {
      return new URL(m).hostname;
    } catch {
      return m;
    }
  });
  const mintDisplay = mintHosts.join(', ');

  const siteHost = (() => {
    try {
      return new URL(details.origin).hostname;
    } catch {
      return details.origin;
    }
  })();

  const remainingBalance = details.balance - details.amount;

  // Success state
  if (showSuccess) {
    return (
      <div className="approval-container bg-background min-h-screen text-white flex flex-col items-center justify-center gap-4">
        <AnimatedCheckmark />
        <p className="text-lg font-semibold text-green-500 animate-fade-in-up">Paid!</p>
      </div>
    );
  }

  return (
    <div className="approval-container bg-background min-h-screen text-white flex flex-col gap-4">
      {/* Header */}
      <div className="text-center mb-2">
        <h1 className="text-lg font-semibold mb-1">Payment Request</h1>
        <p className="text-sm text-muted-foreground">A site is requesting payment</p>
      </div>

      {/* Payment Details Card */}
      <Card className="bg-card border-0">
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
              <span className="text-sm font-medium truncate max-w-[200px]" title={details.mints.join(', ')}>
                {mintDisplay}
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
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Esc
          </Badge>
        </Button>
        <Button
          className="flex-1 bg-green-500 hover:bg-green-600"
          onClick={handleApprove}
        >
          Pay
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-green-400/30">
            Enter
          </Badge>
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
