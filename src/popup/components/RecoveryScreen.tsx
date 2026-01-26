import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Eye, EyeOff, KeyRound } from 'lucide-react';

interface RecoveryScreenProps {
  onRecovered: () => void;
  onBack: () => void;
}

type Step = 'phrase' | 'newCredential';

export function RecoveryScreen({ onRecovered, onBack }: RecoveryScreenProps) {
  const [step, setStep] = useState<Step>('phrase');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [authType, setAuthType] = useState<'pin' | 'password'>('pin');
  const [credential, setCredential] = useState('');
  const [confirmCredential, setConfirmCredential] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerifyPhrase = async () => {
    if (!recoveryPhrase.trim()) {
      setError('Please enter your recovery phrase');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'RECOVER_WITH_PHRASE',
        phrase: recoveryPhrase.trim(),
        verify: true, // Just verify, don't reset yet
      });

      if (result.valid) {
        setStep('newCredential');
      } else {
        setError('Invalid recovery phrase');
      }
    } catch {
      setError('Failed to verify recovery phrase');
    } finally {
      setLoading(false);
    }
  };

  const handleResetCredential = async () => {
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

  // Step 1: Enter recovery phrase
  if (step === 'phrase') {
    return (
      <div className="popup-container bg-background p-6 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-white">Recovery</h2>
          <p className="text-sm text-muted-foreground text-center">
            Enter your 12-word recovery phrase to reset your PIN or password
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
        </Button>

        <Button variant="ghost" onClick={onBack} className="text-muted-foreground">
          Back to Login
        </Button>
      </div>
    );
  }

  // Step 2: Set new credential
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
      </Button>

      <Button variant="ghost" onClick={() => setStep('phrase')} className="text-muted-foreground">
        Back
      </Button>
    </div>
  );
}

export default RecoveryScreen;
