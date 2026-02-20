import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, Check, X, Wallet } from 'lucide-react';
import type { RecoveryProgress, MintConfig } from '../../shared/types';

interface RecoveryScreenProps {
  onRecovered: () => void;
  onBack: () => void;
}

type Step = 'phrase' | 'selectMints' | 'recovering' | 'results' | 'newCredential';
type RecoveryMode = 'pin_reset' | 'wallet_restore';

export function RecoveryScreen({ onRecovered, onBack }: RecoveryScreenProps) {
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
      // If no saved mints, use default mints for recovery
      const mintsToUse = savedMints.length > 0 ? savedMints : defaultMints;
      setAvailableMints(mintsToUse);
      // Select all enabled mints by default
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

      // Check if all complete
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept Enter when typing in textarea (recovery phrase input)
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

  const handleVerifyPhrase = async () => {
    if (!recoveryPhrase.trim()) {
      setError('Please enter your recovery phrase');
      return;
    }

    // Validate it's 12 words
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
      new URL(url); // Validate URL

      // Check for duplicates
      if (availableMints.some((m) => m.url === url)) {
        setError('Mint already in list');
        return;
      }

      // Add to the visible list
      const newMint: MintConfig = {
        url,
        name: new URL(url).hostname,
        enabled: true,
        trusted: false,
      };
      setAvailableMints((prev) => [...prev, newMint]);

      // Mark it as selected
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
    // Proceed to set new credential after wallet recovery
    setStep('newCredential');
  };

  // Step 1: Enter recovery phrase
  if (step === 'phrase') {
    return (
      <div className="popup-container bg-background p-6 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-white">Wallet Recovery</h2>
          <p className="text-sm text-muted-foreground text-center">
            Enter your 12-word seed phrase
          </p>
        </div>

        {/* Recovery mode selection */}
        <div className="space-y-2">
          <Label>What would you like to recover?</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={recoveryMode === 'pin_reset' ? 'default' : 'outline'}
              onClick={() => setRecoveryMode('pin_reset')}
              className="h-auto py-3"
            >
              <div className="text-center">
                <KeyRound className="h-4 w-4 mx-auto mb-1" />
                <div className="text-xs">Reset PIN</div>
              </div>
            </Button>
            <Button
              variant={recoveryMode === 'wallet_restore' ? 'default' : 'outline'}
              onClick={() => setRecoveryMode('wallet_restore')}
              className="h-auto py-3"
            >
              <div className="text-center">
                <Wallet className="h-4 w-4 mx-auto mb-1" />
                <div className="text-xs">Restore Wallet</div>
              </div>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {recoveryMode === 'pin_reset'
              ? 'Reset your PIN/password without scanning for funds'
              : 'Scan mints to recover your ecash balance'}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Recovery Phrase</Label>
          <Textarea
            placeholder="Enter your 12 words separated by spaces..."
            value={recoveryPhrase}
            onChange={(e) => setRecoveryPhrase(e.target.value)}
            className="bg-card border-input min-h-[100px]"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Button onClick={handleVerifyPhrase} disabled={loading}>
          {loading ? 'Verifying...' : 'Continue'}
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Enter
          </Badge>
        </Button>

        <Button variant="ghost" onClick={onBack} className="text-muted-foreground">
          Back to Login
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Esc
          </Badge>
        </Button>
      </div>
    );
  }

  // Step 2: Select mints for recovery
  if (step === 'selectMints') {
    return (
      <div className="popup-container bg-background p-6 flex flex-col gap-4">
        <div className="text-center mb-2">
          <h2 className="text-lg font-semibold text-white">Select Mints</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which mints to scan for recoverable funds
          </p>
        </div>

        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {availableMints.map((mint) => (
            <label
              key={mint.url}
              className="flex items-center gap-3 p-3 rounded-lg bg-card cursor-pointer hover:bg-card/80"
            >
              <Checkbox
                checked={selectedMints.has(mint.url)}
                onCheckedChange={(checked) => {
                  setSelectedMints((prev) => {
                    const next = new Set(prev);
                    if (checked) {
                      next.add(mint.url);
                    } else {
                      next.delete(mint.url);
                    }
                    return next;
                  });
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{mint.name}</div>
                <div className="text-xs text-muted-foreground truncate">{mint.url}</div>
              </div>
            </label>
          ))}
        </div>

        {/* Custom mint input */}
        <div className="flex gap-2">
          <Input
            placeholder="Add custom mint URL..."
            value={customMintUrl}
            onChange={(e) => setCustomMintUrl(e.target.value)}
            className="bg-card border-input"
          />
          <Button variant="secondary" onClick={handleAddCustomMint}>
            Add
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Button onClick={handleStartRecovery} disabled={loading || selectedMints.size === 0}>
          {loading ? 'Starting...' : `Scan ${selectedMints.size} Mint${selectedMints.size !== 1 ? 's' : ''}`}
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Enter
          </Badge>
        </Button>

        <Button variant="ghost" onClick={() => setStep('phrase')} className="text-muted-foreground">
          Back
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Esc
          </Badge>
        </Button>
      </div>
    );
  }

  // Step 3: Recovery in progress
  if (step === 'recovering') {
    return (
      <div className="popup-container bg-background p-6 flex flex-col gap-4">
        <div className="text-center mb-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <h2 className="text-lg font-semibold text-white">Recovering Wallet</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Scanning mints for your ecash...
          </p>
        </div>

        <div className="space-y-2">
          {recoveryProgress.map((progress) => (
            <div key={progress.mintUrl} className="p-3 rounded-lg bg-card">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-white truncate max-w-[200px]">
                  {progress.mintUrl.replace(/^https?:\/\//, '')}
                </span>
                {progress.status === 'scanning' && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                {progress.status === 'found' && (
                  <span className="text-green-400 text-xs">Found!</span>
                )}
                {progress.status === 'complete' && (
                  <Check className="h-4 w-4 text-green-400" />
                )}
                {progress.status === 'error' && (
                  <X className="h-4 w-4 text-red-400" />
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {progress.status === 'scanning' && `Scanning counter ${progress.currentCounter}...`}
                {progress.status === 'found' &&
                  `Found ${progress.proofsFound} proofs (${progress.totalAmount} sats)`}
                {progress.status === 'complete' &&
                  (progress.totalAmount > 0
                    ? `Recovered ${progress.totalAmount} sats`
                    : 'No funds found')}
                {progress.status === 'error' && progress.errorMessage}
              </div>
            </div>
          ))}
        </div>

        <Button variant="secondary" onClick={handleCancelRecovery}>
          Cancel
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Esc
          </Badge>
        </Button>
      </div>
    );
  }

  // Step 4: Recovery results
  if (step === 'results') {
    return (
      <div className="popup-container bg-background p-6 flex flex-col gap-4">
        <div className="text-center mb-2">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-2">
            <Check className="h-6 w-6 text-green-400" />
          </div>
          <h2 className="text-lg font-semibold text-white">Recovery Complete</h2>
          {recoveryResult && recoveryResult.totalRecovered > 0 ? (
            <p className="text-2xl font-bold text-primary mt-2">
              {recoveryResult.totalRecovered} sats
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">
              No funds found on selected mints
            </p>
          )}
        </div>

        {recoveryResult && recoveryResult.mintResults.length > 0 && (
          <div className="space-y-2">
            {recoveryResult.mintResults.map((result) => (
              <div key={result.mintUrl} className="p-3 rounded-lg bg-card">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white truncate max-w-[180px]">
                    {result.mintUrl.replace(/^https?:\/\//, '')}
                  </span>
                  <span className="text-sm font-medium text-primary">
                    {result.amount} sats
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {result.proofCount} proofs
                </div>
              </div>
            ))}
          </div>
        )}

        <Button onClick={handleFinishRecovery}>
          Set New {authType === 'pin' ? 'PIN' : 'Password'}
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Enter
          </Badge>
        </Button>
      </div>
    );
  }

  // Step 5: Set new credential
  return (
    <div className="popup-container bg-background p-6 flex flex-col gap-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-semibold text-white">Set New {authType === 'pin' ? 'PIN' : 'Password'}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a new {authType} to protect your wallet
        </p>
      </div>

      <Tabs value={authType} onValueChange={(v) => setAuthType(v as 'pin' | 'password')} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-card">
          <TabsTrigger value="pin">PIN</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
        </TabsList>
        <TabsContent value="pin" className="mt-4">
          <Card className="bg-card border-0">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">4-6 digit numeric code</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="password" className="mt-4">
          <Card className="bg-card border-0">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Alphanumeric, min 6 characters</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>New {authType === 'pin' ? 'PIN' : 'Password'}</Label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              inputMode={authType === 'pin' ? 'numeric' : undefined}
              pattern={authType === 'pin' ? '[0-9]*' : undefined}
              placeholder={authType === 'pin' ? '••••' : '••••••'}
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              maxLength={authType === 'pin' ? 6 : 50}
              className="bg-card border-input pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Confirm {authType === 'pin' ? 'PIN' : 'Password'}</Label>
          <Input
            type={showPassword ? 'text' : 'password'}
            inputMode={authType === 'pin' ? 'numeric' : undefined}
            pattern={authType === 'pin' ? '[0-9]*' : undefined}
            placeholder={authType === 'pin' ? '••••' : '••••••'}
            value={confirmCredential}
            onChange={(e) => setConfirmCredential(e.target.value)}
            maxLength={authType === 'pin' ? 6 : 50}
            className="bg-card border-input"
            autoComplete="new-password"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <Button onClick={handleResetCredential} disabled={loading}>
        {loading ? 'Saving...' : 'Save & Unlock'}
        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
          Enter
        </Badge>
      </Button>

      <Button variant="ghost" onClick={() => setStep('phrase')} className="text-muted-foreground">
        Start Over
        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
          Esc
        </Badge>
      </Button>
    </div>
  );
}

export default RecoveryScreen;
