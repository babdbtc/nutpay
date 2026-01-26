import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Eye, EyeOff, Lock } from 'lucide-react';

interface LockScreenProps {
  authType: 'pin' | 'password';
  onUnlock: () => void;
  onForgot: () => void;
}

export function LockScreen({ authType, onUnlock, onForgot }: LockScreenProps) {
  const [credential, setCredential] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  useEffect(() => {
    checkLockout();
  }, []);

  useEffect(() => {
    if (lockoutRemaining > 0) {
      const timer = setTimeout(() => {
        setLockoutRemaining(lockoutRemaining - 1);
        if (lockoutRemaining <= 1) {
          setError(null);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [lockoutRemaining]);

  const checkLockout = async () => {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'CHECK_SESSION' });
      if (result.locked && result.remainingMs) {
        setLockoutRemaining(Math.ceil(result.remainingMs / 1000));
        setError(`Too many failed attempts. Try again in ${Math.ceil(result.remainingMs / 1000)}s`);
      }
    } catch {
      // Ignore
    }
  };

  const handleUnlock = async () => {
    if (!credential.trim()) {
      setError(`Please enter your ${authType}`);
      return;
    }

    if (lockoutRemaining > 0) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'VERIFY_AUTH',
        credential,
      });

      if (result.success) {
        onUnlock();
      } else if (result.locked) {
        setLockoutRemaining(Math.ceil(result.remainingMs / 1000));
        setError(`Too many failed attempts. Try again in ${Math.ceil(result.remainingMs / 1000)}s`);
      } else {
        setError(result.error || `Invalid ${authType}`);
      }
    } catch {
      setError('Authentication failed');
    } finally {
      setLoading(false);
      setCredential('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading && lockoutRemaining === 0) {
      handleUnlock();
    }
  };

  const isLocked = lockoutRemaining > 0;

  return (
    <div className="popup-container bg-background p-6 flex flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-card flex items-center justify-center">
          <Lock className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-primary">Nutpay</h1>
        <p className="text-sm text-muted-foreground">
          Enter your {authType} to unlock
        </p>
      </div>

      <div className="w-full max-w-[280px] space-y-4">
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
              onKeyDown={handleKeyDown}
              maxLength={authType === 'pin' ? 6 : 50}
              className="bg-card border-input pr-10"
              autoComplete="current-password"
              autoFocus
              disabled={isLocked}
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

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Button
          className="w-full"
          onClick={handleUnlock}
          disabled={loading || isLocked}
        >
          {loading ? 'Unlocking...' : isLocked ? `Locked (${lockoutRemaining}s)` : 'Unlock'}
        </Button>

        <button
          onClick={onForgot}
          className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          Forgot {authType}?
        </button>
      </div>
    </div>
  );
}

export default LockScreen;
