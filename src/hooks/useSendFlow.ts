import { useState, useEffect } from 'react';
import type { MintConfig, MeltQuoteInfo } from '../shared/types';

/** LNURL-pay parameters returned from resolving a Lightning address */
export interface LnurlPayParams {
  callback: string;
  minSendable: number;
  maxSendable: number;
  description: string;
  domain: string;
  lightningAddress?: string;
  commentAllowed?: number;
}

interface UseSendFlowProps {
  mints: MintConfig[];
  balances: Map<string, number>;
  onSuccess: () => void;
  onClose: () => void;
}

export interface UseSendFlowReturn {
  amount: string;
  setAmount: (v: string) => void;
  selectedMint: string;
  setSelectedMint: (v: string) => void;
  invoice: string;
  setInvoice: (v: string) => void;
  loading: boolean;
  error: string | null;
  setError: (v: string | null) => void;
  generatedToken: string | null;
  meltQuote: MeltQuoteInfo | null;
  setMeltQuote: (v: MeltQuoteInfo | null) => void;
  copied: boolean;
  success: boolean;
  lnurlParams: LnurlPayParams | null;
  setLnurlParams: (v: LnurlPayParams | null) => void;
  lnurlAmount: string;
  setLnurlAmount: (v: string) => void;
  lnurlComment: string;
  setLnurlComment: (v: string) => void;
  resolvedInvoice: string | null;
  setResolvedInvoice: (v: string | null) => void;
  enabledMints: MintConfig[];
  selectedBalance: number;
  inputType: 'lightning-address' | 'bolt11' | 'unknown';
  handleTabChange: () => void;
  handleGenerateToken: () => Promise<void>;
  handleResolveLnurl: () => Promise<void>;
  handleLnurlPay: () => Promise<void>;
  handleGetQuote: () => Promise<void>;
  handlePayInvoice: () => Promise<void>;
  copyToClipboard: () => Promise<void>;
}

export function useSendFlow({ mints, balances, onSuccess, onClose }: UseSendFlowProps): UseSendFlowReturn {
  const [amount, setAmount] = useState('');
  const [selectedMint, setSelectedMint] = useState(mints[0]?.url || '');
  const [invoice, setInvoice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [meltQuote, setMeltQuote] = useState<MeltQuoteInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);

  // LNURL-pay state
  const [lnurlParams, setLnurlParams] = useState<LnurlPayParams | null>(null);
  const [lnurlAmount, setLnurlAmount] = useState('');
  const [lnurlComment, setLnurlComment] = useState('');
  // The bolt11 invoice obtained from LNURL callback (used for melt)
  const [resolvedInvoice, setResolvedInvoice] = useState<string | null>(null);

  const enabledMints = mints.filter((m) => m.enabled);
  const selectedBalance = balances.get(selectedMint) || 0;

  // Detect input type for the Lightning field
  const getInputType = (input: string): 'lightning-address' | 'bolt11' | 'unknown' => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return 'unknown';

    // Lightning address: user@domain.com
    const parts = trimmed.split('@');
    if (parts.length === 2 && parts[0].length > 0 && parts[1].includes('.')) {
      return 'lightning-address';
    }

    // Bolt11 invoice
    if (trimmed.startsWith('lnbc') || trimmed.startsWith('lntb') || trimmed.startsWith('lnbs')) {
      return 'bolt11';
    }

    // LNURL bech32 — treat as lightning address flow
    if (trimmed.startsWith('lnurl1') || trimmed.startsWith('lnurl:')) {
      return 'lightning-address';
    }

    return 'unknown';
  };

  const inputType = getInputType(invoice);

  const handleTabChange = () => {
    setError(null);
    setGeneratedToken(null);
    setMeltQuote(null);
    setSuccess(false);
    setLnurlParams(null);
    setResolvedInvoice(null);
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

  // Resolve a Lightning address or LNURL to get pay params
  const handleResolveLnurl = async () => {
    if (!invoice.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'RESOLVE_LNURL',
        input: invoice.trim(),
      });

      if (result.success && result.params) {
        const params = result.params as LnurlPayParams;
        setLnurlParams(params);

        // Pre-fill amount with min if min === max (fixed amount)
        const minSats = Math.ceil(params.minSendable / 1000);
        const maxSats = Math.floor(params.maxSendable / 1000);
        if (minSats === maxSats) {
          setLnurlAmount(minSats.toString());
        }
      } else {
        setError(result.error || 'Failed to resolve Lightning address');
      }
    } catch {
      setError('Failed to resolve Lightning address');
    } finally {
      setLoading(false);
    }
  };

  // Request invoice from LNURL callback and get melt quote
  const handleLnurlPay = async () => {
    if (!lnurlParams) return;

    const amountSats = parseInt(lnurlAmount, 10);
    if (!amountSats || amountSats <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    const minSats = Math.ceil(lnurlParams.minSendable / 1000);
    const maxSats = Math.floor(lnurlParams.maxSendable / 1000);

    if (amountSats < minSats) {
      setError(`Minimum amount is ${minSats} sats`);
      return;
    }

    if (amountSats > maxSats) {
      setError(`Maximum amount is ${maxSats} sats`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Get bolt11 invoice from LNURL callback
      const invoiceResult = await chrome.runtime.sendMessage({
        type: 'REQUEST_LNURL_INVOICE',
        callback: lnurlParams.callback,
        amountMsat: amountSats * 1000,
        comment: lnurlComment || undefined,
      });

      if (!invoiceResult.success || !invoiceResult.pr) {
        setError(invoiceResult.error || 'Failed to get invoice from Lightning address');
        return;
      }

      const bolt11 = invoiceResult.pr as string;
      setResolvedInvoice(bolt11);

      // Step 2: Get melt quote for the invoice
      const quoteResult = await chrome.runtime.sendMessage({
        type: 'GET_MELT_QUOTE',
        mintUrl: selectedMint,
        invoice: bolt11,
      });

      if (quoteResult.success && quoteResult.quote) {
        const total = quoteResult.quote.amount + quoteResult.quote.fee;
        if (total > selectedBalance) {
          setError(`Insufficient balance. Need ${total} sats (${quoteResult.quote.amount} + ${quoteResult.quote.fee} fee), have ${selectedBalance} sats.`);
        } else {
          setMeltQuote(quoteResult.quote);
        }
      } else {
        setError(quoteResult.error || 'Failed to get quote');
      }
    } catch {
      setError('Failed to process payment');
    } finally {
      setLoading(false);
    }
  };

  const handleGetQuote = async () => {
    if (!invoice.trim()) {
      setError('Please enter a Lightning invoice or address');
      return;
    }

    // If it's a Lightning address or LNURL, resolve it first
    if (inputType === 'lightning-address') {
      await handleResolveLnurl();
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

    // Use the resolved LNURL invoice if available, otherwise use the raw input
    const payInvoice = resolvedInvoice || invoice.trim();

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'MELT_PROOFS',
        mintUrl: selectedMint,
        invoice: payInvoice,
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
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (meltQuote) {
          setMeltQuote(null);
          setResolvedInvoice(null);
        } else if (lnurlParams) {
          setLnurlParams(null);
          setLnurlAmount('');
          setLnurlComment('');
        } else if (generatedToken || success) {
          onSuccess();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [meltQuote, lnurlParams, generatedToken, success, loading, onSuccess, onClose]);

  return {
    amount,
    setAmount,
    selectedMint,
    setSelectedMint,
    invoice,
    setInvoice,
    loading,
    error,
    setError,
    generatedToken,
    meltQuote,
    setMeltQuote,
    copied,
    success,
    lnurlParams,
    setLnurlParams,
    lnurlAmount,
    setLnurlAmount,
    lnurlComment,
    setLnurlComment,
    resolvedInvoice,
    setResolvedInvoice,
    enabledMints,
    selectedBalance,
    inputType,
    handleTabChange,
    handleGenerateToken,
    handleResolveLnurl,
    handleLnurlPay,
    handleGetQuote,
    handlePayInvoice,
    copyToClipboard,
  };
}
