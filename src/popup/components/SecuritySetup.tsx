import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Check, Copy, ShieldAlert } from 'lucide-react';
import { CredentialForm } from '@/components/shared/CredentialForm';
import { SeedPhraseDisplay } from '@/components/shared/SeedPhraseDisplay';

interface SecuritySetupProps {
  onComplete: () => void;
  onSkip: () => void;
}

type Step = 'choose' | 'create' | 'recovery' | 'verify' | 'confirm';

export function SecuritySetup({ onComplete, onSkip }: SecuritySetupProps) {
  const [step, setStep] = useState<Step>('choose');
  const [authType, setAuthType] = useState<'pin' | 'password'>('pin');
  const [credential, setCredential] = useState('');
  const [confirmCredential, setConfirmCredential] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [copiedPhrase, setCopiedPhrase] = useState(false);
  const [acknowledgedPhrase, setAcknowledgedPhrase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Verification step state
  const [verificationWords, setVerificationWords] = useState<number[]>([]);
  const [verificationInputs, setVerificationInputs] = useState<{ [key: number]: string }>({});

  // Generate 3 random word indices for verification
  const generateVerificationIndices = (phraseLength: number): number[] => {
    const indices: number[] = [];
    while (indices.length < 3) {
      const idx = Math.floor(Math.random() * phraseLength);
      if (!indices.includes(idx)) {
        indices.push(idx);
      }
    }
    return indices.sort((a, b) => a - b);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (step === 'choose') {
          setStep('create');
        } else if (step === 'create' && !loading) {
          handleCreateCredential();
        } else if (step === 'recovery' && acknowledgedPhrase) {
          handleProceedToVerify();
        } else if (step === 'verify') {
          handleVerifyWords();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (step === 'choose') {
          onSkip();
        } else if (step === 'create') {
          setStep('choose');
        } else if (step === 'recovery') {
          // Can't go back from recovery (credential already created)
        } else if (step === 'verify') {
          setStep('recovery');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, loading, acknowledgedPhrase, verificationInputs]);

  const handleCreateCredential = async () => {
    setError(null);

    // Validate
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

    // Generate recovery phrase
    setLoading(true);
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'SETUP_SECURITY',
        authType,
        credential,
        generatePhrase: true,
      });

      if (result.success) {
        setRecoveryPhrase(result.recoveryPhrase);
        setStep('recovery');
      } else {
        setError(result.error || 'Failed to setup security');
      }
    } catch {
      setError('Failed to setup security');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPhrase = async () => {
    await navigator.clipboard.writeText(recoveryPhrase);
    setCopiedPhrase(true);
    setTimeout(() => setCopiedPhrase(false), 2000);
  };

  const handleProceedToVerify = () => {
    if (!acknowledgedPhrase) {
      setError('Please confirm you have saved the recovery phrase');
      return;
    }
    const words = recoveryPhrase.split(' ');
    const indices = generateVerificationIndices(words.length);
    setVerificationWords(indices);
    setVerificationInputs({});
    setError(null);
    setStep('verify');
  };

  const handleVerifyWords = () => {
    const words = recoveryPhrase.split(' ');
    let allCorrect = true;

    for (const idx of verificationWords) {
      const input = verificationInputs[idx]?.toLowerCase().trim();
      if (input !== words[idx]) {
        allCorrect = false;
        break;
      }
    }

    if (allCorrect) {
      onComplete();
    } else {
      setError('Words do not match. Please check your recovery phrase.');
    }
  };

  // Step 1: Choose type
  if (step === 'choose') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="text-center mb-2">
          <h2 className="text-lg font-semibold text-white">Secure Your Wallet</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add PIN or password protection
          </p>
        </div>

        <Tabs value={authType} onValueChange={(v) => setAuthType(v as 'pin' | 'password')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-card">
            <TabsTrigger value="pin">PIN</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
          </TabsList>
          <TabsContent value="pin" className="mt-4">
            <Card className="bg-card border-0">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  4-6 digit numeric code. Quick to enter.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="password" className="mt-4">
            <Card className="bg-card border-0">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Alphanumeric password. More secure.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Button onClick={() => setStep('create')}>
          Continue with {authType === 'pin' ? 'PIN' : 'Password'}
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Enter
          </Badge>
        </Button>

        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
          Skip for now
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Esc
          </Badge>
        </Button>
      </div>
    );
  }

  // Step 2: Create credential
  if (step === 'create') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="text-center mb-2">
          <h2 className="text-lg font-semibold text-white">
            Create {authType === 'pin' ? 'PIN' : 'Password'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {authType === 'pin' ? 'Enter a 4-6 digit PIN' : 'Enter a secure password'}
          </p>
        </div>

        <div className="space-y-4">
          <CredentialForm
            authType={authType}
            credential={credential}
            onCredentialChange={setCredential}
            confirmCredential={confirmCredential}
            onConfirmChange={setConfirmCredential}
            showPassword={showPassword}
            onToggleShow={() => setShowPassword(!showPassword)}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Button onClick={handleCreateCredential} disabled={loading}>
          {loading ? 'Setting up...' : 'Continue'}
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Enter
          </Badge>
        </Button>

        <Button variant="ghost" onClick={() => setStep('choose')} className="text-muted-foreground">
          Back
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Esc
          </Badge>
        </Button>
      </div>
    );
  }

  // Step 3: Recovery phrase display
  if (step === 'recovery') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="text-center mb-2">
          <h2 className="text-lg font-semibold text-white">Recovery Seed Phrase</h2>
          <p className="text-sm text-muted-foreground mt-1">
            This phrase controls your wallet. Write it down carefully!
          </p>
        </div>

        {/* Critical warning */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-sm">
          <ShieldAlert className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">This seed phrase controls real funds</p>
            <p className="mt-1 text-red-400/80">
              Anyone with this phrase can restore your wallet and spend your ecash. Never share it. Store it safely offline.
            </p>
          </div>
        </div>

        <SeedPhraseDisplay phrase={recoveryPhrase} />

        <Button variant="secondary" onClick={handleCopyPhrase}>
          {copiedPhrase ? (
            <><Check className="h-4 w-4 mr-2" /> Copied!</>
          ) : (
            <><Copy className="h-4 w-4 mr-2" /> Copy Phrase</>
          )}
        </Button>

        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledgedPhrase}
            onChange={(e) => setAcknowledgedPhrase(e.target.checked)}
            className="rounded"
          />
          I have saved my recovery phrase securely
        </label>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Button onClick={handleProceedToVerify} disabled={!acknowledgedPhrase}>
          Verify Phrase
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Enter
          </Badge>
        </Button>
      </div>
    );
  }

  // Step 4: Verify recovery phrase
  if (step === 'verify') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="text-center mb-2">
          <h2 className="text-lg font-semibold text-white">Verify Your Phrase</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Enter the requested words to confirm you saved your phrase
          </p>
        </div>

        <div className="space-y-4">
          {verificationWords.map((wordIdx) => (
            <div key={wordIdx} className="space-y-2">
              <Label>Word #{wordIdx + 1}</Label>
              <Input
                type="text"
                placeholder={`Enter word ${wordIdx + 1}`}
                value={verificationInputs[wordIdx] || ''}
                onChange={(e) =>
                  setVerificationInputs((prev) => ({
                    ...prev,
                    [wordIdx]: e.target.value,
                  }))
                }
                className="bg-card border-input"
                autoCapitalize="none"
                autoComplete="off"
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Button onClick={handleVerifyWords}>
          Complete Setup
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Enter
          </Badge>
        </Button>

        <Button variant="ghost" onClick={() => setStep('recovery')} className="text-muted-foreground">
          Back to Phrase
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
            Esc
          </Badge>
        </Button>
      </div>
    );
  }

  return null;
}

export default SecuritySetup;
