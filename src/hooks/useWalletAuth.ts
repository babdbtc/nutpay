import { useState, useEffect } from 'react';

export type AuthState = 'checking' | 'welcome' | 'setup' | 'import' | 'locked' | 'recovery' | 'unlocked';

interface UseWalletAuthReturn {
  authState: AuthState;
  setAuthState: (state: AuthState) => void;
  authType: 'pin' | 'password';
  securityEnabled: boolean;
  handleLock: () => Promise<void>;
}

export function useWalletAuth(): UseWalletAuthReturn {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [authType, setAuthType] = useState<'pin' | 'password'>('pin');
  const [securityEnabled, setSecurityEnabled] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'CHECK_SESSION' });

      if (!result.securityEnabled) {
        setSecurityEnabled(false);
        const hasBalance = await chrome.runtime.sendMessage({ type: 'GET_BALANCE' });
        const walletInfo = await chrome.runtime.sendMessage({ type: 'GET_WALLET_INFO' });

        if (hasBalance && hasBalance.length > 0) {
          setAuthState('setup');
        } else if (!walletInfo.hasSeed) {
          setAuthState('welcome');
        } else {
          setAuthState('unlocked');
        }
      } else if (result.valid) {
        setSecurityEnabled(true);
        setAuthType(result.authType);
        setAuthState('unlocked');
      } else {
        setSecurityEnabled(true);
        setAuthType(result.authType);
        setAuthState('locked');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthState('welcome');
    }
  };

  const handleLock = async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_SESSION' });
    setAuthState('locked');
  };

  return {
    authState,
    setAuthState,
    authType,
    securityEnabled,
    handleLock,
  };
}
