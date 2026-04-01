import { useState, useEffect } from 'react';
import type { RecoveryProgress, MintConfig } from '../shared/types';

export type Step = 'phrase' | 'selectMints' | 'recovering' | 'results' | 'newCredential';
export type RecoveryMode = 'pin_reset' | 'wallet_restore';

interface UseRecoveryOptions {
  onRecovered: () => void;
  onBack: () => void;
}

export function useRecovery({ onRecovered, onBack }: UseRecoveryOptions) {
  const [step, setStep] = useState<Step>('phrase');
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>('pin_reset');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [authType, setAuthType] = useState<'pin' | 'password'>('pin');
  const [credential, setCredential] = useState('');
  const [confirmCredential, setConfirmCredential] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Mint selection state
  const [availableMints, setAvailableMints] = useState<MintConfig[]>([]);
  const [selectedMints, setSelectedMints] = useState<Set<string>>(new Set());
  const [customMintUrl, setCustomMintUrl] = useState('');

  // Recovery progress state
  const [recoveryProgress, setRecoveryProgress] = useState<RecoveryProgress[]>([]);
  const [recoveryResult, setRecoveryResult] = useState<{
    totalRecovered: number;
    mintResults: Array<{ mintUrl: string; amount: number; proofCount: number }>;
  } | null>(null);

  // Default popular mints for recovery (when user has no saved mints)
  const defaultMints: MintConfig[] = [
    { url: 'https://mint.minibits.cash/Bitcoin', name: 'Minibits', enabled: true, trusted: true },
    { url: 'https://mint.coinos.io', name: 'Coinos', enabled: true, trusted: true },
    { url: 'https://mint.lnvoltz.com', name: 'LNVoltz', enabled: true, trusted: true },
  ];

  // Load available mints
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_MINTS' }).then((mints) => {
      const savedMints = mints || [];
      const mintsToUse = savedMints.length > 0 ? savedMints : defaultMints;
      setAvailableMints(mintsToUse);
      const enabled = new Set<string>(
        mintsToUse.filter((m: MintConfig) => m.enabled).map((m: MintConfig) => m.url)
      );
      setSelectedMints(enabled);
    });
  }, []);

  // Poll for recovery progress
  useEffect(() => {
    if (step !== 'recovering') return;

    const interval = setInterval(async () => {
      const status = await chrome.runtime.sendMessage({ type: 'GET_RECOVERY_PROGRESS' });

      if (status.progress) {
        setRecoveryProgress(status.progress);
      }

      if (!status.inProgress && status.progress?.length > 0) {
        const allComplete = status.progress.every(
          (p: RecoveryProgress) => p.status === 'complete' || p.status === 'error'
        );
        if (allComplete) {
          const totalRecovered = status.progress.reduce(
            (sum: number, p: RecoveryProgress) => sum + p.totalAmount,
            0
          );
          const mintResults = status.progress
            .filter((p: RecoveryProgress) => p.totalAmount > 0)
            .map((p: RecoveryProgress) => ({
              mintUrl: p.mintUrl,
              amount: p.totalAmount,
              proofCount: p.proofsFound,
            }));

          setRecoveryResult({ totalRecovered, mintResults });
          setStep('results');
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [step]);

  const handleVerifyPhrase = async () => {
    if (!recoveryPhrase.trim()) {
      setError('Please enter your recovery phrase');
      return;
    }

    const words = recoveryPhrase.trim().toLowerCase().split(/\s+/);
    if (words.length !== 12) {
      setError('Recovery phrase must be exactly 12 words');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'RECOVER_WITH_PHRASE',
        phrase: recoveryPhrase.trim(),
        verify: true,
      });

      if (result.valid) {
        if (recoveryMode === 'pin_reset') {
          setStep('newCredential');
        } else {
          setStep('selectMints');
        }
      } else {
        setError('Invalid recovery phrase');
      }
    } catch {
      setError('Failed to verify recovery phrase');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomMint = () => {
    if (!customMintUrl.trim()) return;
    setError(null);

    try {
      const url = customMintUrl.trim();
      new URL(url);

      if (availableMints.some((m) => m.url === url)) {
        setError('Mint already in list');
        return;
      }

      const newMint: MintConfig = {
        url,
        name: new URL(url).hostname,
        enabled: true,
        trusted: false,
      };
      setAvailableMints((prev) => [...prev, newMint]);
      setSelectedMints((prev) => new Set([...prev, url]));
      setCustomMintUrl('');
    } catch {
      setError('Invalid mint URL');
    }
  };

  const handleStartRecovery = async () => {
    if (selectedMints.size === 0) {
      setError('Please select at least one mint');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'START_SEED_RECOVERY',
        mnemonic: recoveryPhrase.trim(),
        mintUrls: Array.from(selectedMints),
      });

      if (result.success) {
        setStep('recovering');
      } else {
        setError(result.error || 'Failed to start recovery');
      }
    } catch {
      setError('Failed to start recovery');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRecovery = async () => {
    await chrome.runtime.sendMessage({ type: 'CANCEL_RECOVERY' });
    setStep('selectMints');
  };

  const handleResetCredential = async () => {
    setError(null);

    if (authType === 'pin') {
      if (!/^\d{4,6}$/.test(credential)) {
        setError('PIN must be 4-6 digits');
        return;
      }
    } else {
      if (credential.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
    }

    if (credential !== confirmCredential) {
      setError(`${authType === 'pin' ? 'PINs' : 'Passwords'} do not match`);
      return;
    }

    setLoading(true);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'RECOVER_WITH_PHRASE',
        phrase: recoveryPhrase.trim(),
        verify: false,
        newAuthType: authType,
        newCredential: credential,
      });

      if (result.success) {
        onRecovered();
      } else {
        setError(result.error || 'Failed to reset credential');
      }
    } catch {
      setError('Failed to reset credential');
    } finally {
      setLoading(false);
    }
  };

  const handleFinishRecovery = () => {
    setStep('newCredential');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (step === 'phrase' && !loading) {
          handleVerifyPhrase();
        } else if (step === 'selectMints' && !loading && selectedMints.size > 0) {
          handleStartRecovery();
        } else if (step === 'results') {
          handleFinishRecovery();
        } else if (step === 'newCredential' && !loading) {
          handleResetCredential();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (step === 'phrase') {
          onBack();
        } else if (step === 'selectMints') {
          setStep('phrase');
        } else if (step === 'recovering') {
          handleCancelRecovery();
        } else if (step === 'newCredential') {
          setStep('phrase');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, loading, selectedMints.size]);

  return {
    step,
    setStep,
    recoveryMode,
    setRecoveryMode,
    recoveryPhrase,
    setRecoveryPhrase,
    authType,
    setAuthType,
    credential,
    setCredential,
    confirmCredential,
    setConfirmCredential,
    showPassword,
    setShowPassword,
    error,
    loading,
    availableMints,
    selectedMints,
    setSelectedMints,
    customMintUrl,
    setCustomMintUrl,
    recoveryProgress,
    recoveryResult,
    handleVerifyPhrase,
    handleAddCustomMint,
    handleStartRecovery,
    handleCancelRecovery,
    handleResetCredential,
    handleFinishRecovery,
  };
}
