import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertCircle, Check, Copy, Eye, EyeOff } from 'lucide-react';

interface SecuritySetupProps {
  onComplete: () => void;
  onSkip: () => void;
}

type Step = 'choose' | 'create' | 'recovery' | 'confirm';

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

  const handleFinish = () => {
    if (!acknowledgedPhrase) {
      setError('Please confirm you have saved the recovery phrase');
      return;
    }
    onComplete();
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
        </Button>

        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
          Skip for now
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
          <div className="space-y-2">
            <Label>{authType === 'pin' ? 'PIN' : 'Password'}</Label>
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

        <Button onClick={handleCreateCredential} disabled={loading}>
          {loading ? 'Setting up...' : 'Continue'}
        </Button>

        <Button variant="ghost" onClick={() => setStep('choose')} className="text-muted-foreground">
          Back
        </Button>
      </div>
    );
  }

  // Step 3: Recovery phrase
  if (step === 'recovery') {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="text-center mb-2">
          <h2 className="text-lg font-semibold text-white">Recovery Phrase</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Save this phrase to recover your wallet if you forget your {authType}
          </p>
        </div>

        <Card className="bg-card border-0">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-2 text-sm">
              {recoveryPhrase.split(' ').map((word, i) => (
                <div key={i} className="bg-popover rounded p-2 text-center">
                  <span className="text-muted-foreground text-xs mr-1">{i + 1}.</span>
                  <span className="text-white">{word}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Button variant="secondary" onClick={handleCopyPhrase}>
          {copiedPhrase ? (
            <><Check className="h-4 w-4 mr-2" /> Copied!</>
          ) : (
            <><Copy className="h-4 w-4 mr-2" /> Copy Phrase</>
          )}
        </Button>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-500 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            Write this down and store it safely. You will need it to recover your wallet if you forget your {authType}.
          </span>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledgedPhrase}
            onChange={(e) => setAcknowledgedPhrase(e.target.checked)}
            className="rounded"
          />
          I have saved my recovery phrase
        </label>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Button onClick={handleFinish} disabled={!acknowledgedPhrase}>
          Finish Setup
        </Button>
      </div>
    );
  }

  return null;
}

export default SecuritySetup;
