import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Shield, ShieldOff, Eye, EyeOff, KeyRound, AlertCircle, Check, Copy } from 'lucide-react';
import { CredentialForm } from '@/components/shared/CredentialForm';
import { SeedPhraseDisplay } from '@/components/shared/SeedPhraseDisplay';

export function SecuritySettings() {
  const [securityEnabled, setSecurityEnabled] = useState(false);
  const [securityType, setSecurityType] = useState<'pin' | 'password'>('pin');
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  const [setupAuthType, setSetupAuthType] = useState<'pin' | 'password'>('pin');
  const [setupCredential, setSetupCredential] = useState('');
  const [setupConfirmCredential, setSetupConfirmCredential] = useState('');
  const [setupShowPassword, setSetupShowPassword] = useState(false);
  const [setupRecoveryPhrase, setSetupRecoveryPhrase] = useState('');
  const [setupStep, setSetupStep] = useState<'create' | 'recovery'>('create');
  const [setupCopied, setSetupCopied] = useState(false);
  const [setupAcknowledged, setSetupAcknowledged] = useState(false);

  const [changeCurrentCredential, setChangeCurrentCredential] = useState('');
  const [changeNewAuthType, setChangeNewAuthType] = useState<'pin' | 'password'>('pin');
  const [changeNewCredential, setChangeNewCredential] = useState('');
  const [changeConfirmCredential, setChangeConfirmCredential] = useState('');
  const [changeShowPassword, setChangeShowPassword] = useState(false);

  const [recoveryCredential, setRecoveryCredential] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [recoveryShowPassword, setRecoveryShowPassword] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);

  const [disableCredential, setDisableCredential] = useState('');
  const [disableShowPassword, setDisableShowPassword] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SECURITY_CONFIG' }).then((securityData) => {
      if (securityData) {
        setSecurityEnabled(securityData.enabled || false);
        setSecurityType(securityData.type || 'pin');
      }
    }).catch((err) => console.error('Failed to load security config:', err));
  }, []);

  const resetSetupModal = () => {
    setSetupAuthType('pin');
    setSetupCredential('');
    setSetupConfirmCredential('');
    setSetupShowPassword(false);
    setSetupRecoveryPhrase('');
    setSetupStep('create');
    setSetupCopied(false);
    setSetupAcknowledged(false);
    setSecurityError(null);
  };

  const resetChangeModal = () => {
    setChangeCurrentCredential('');
    setChangeNewAuthType('pin');
    setChangeNewCredential('');
    setChangeConfirmCredential('');
    setChangeShowPassword(false);
    setSecurityError(null);
  };

  const resetRecoveryModal = () => {
    setRecoveryCredential('');
    setRecoveryPhrase('');
    setRecoveryShowPassword(false);
    setRecoveryCopied(false);
    setSecurityError(null);
  };

  const resetDisableModal = () => {
    setDisableCredential('');
    setDisableShowPassword(false);
    setSecurityError(null);
  };

  const handleSetupSecurity = async () => {
    setSecurityError(null);

    if (setupAuthType === 'pin') {
      if (!/^\d{4,6}$/.test(setupCredential)) {
        setSecurityError('PIN must be 4-6 digits');
        return;
      }
    } else {
      if (setupCredential.length < 6) {
        setSecurityError('Password must be at least 6 characters');
        return;
      }
    }

    if (setupCredential !== setupConfirmCredential) {
      setSecurityError(`${setupAuthType === 'pin' ? 'PINs' : 'Passwords'} do not match`);
      return;
    }

    setSecurityLoading(true);
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'SETUP_SECURITY',
        authType: setupAuthType,
        credential: setupCredential,
        generatePhrase: true,
      });

      if (result.success) {
        setSetupRecoveryPhrase(result.recoveryPhrase);
        setSetupStep('recovery');
      } else {
        setSecurityError(result.error || 'Failed to setup security');
      }
    } catch {
      setSecurityError('Failed to setup security');
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleFinishSetup = () => {
    if (!setupAcknowledged) {
      setSecurityError('Please confirm you have saved the recovery phrase');
      return;
    }
    setSecurityEnabled(true);
    setSecurityType(setupAuthType);
    setShowSetupModal(false);
    resetSetupModal();
  };

  const handleChangeCredential = async () => {
    setSecurityError(null);

    if (changeNewAuthType === 'pin') {
      if (!/^\d{4,6}$/.test(changeNewCredential)) {
        setSecurityError('New PIN must be 4-6 digits');
        return;
      }
    } else {
      if (changeNewCredential.length < 6) {
        setSecurityError('New password must be at least 6 characters');
        return;
      }
    }

    if (changeNewCredential !== changeConfirmCredential) {
      setSecurityError(`${changeNewAuthType === 'pin' ? 'PINs' : 'Passwords'} do not match`);
      return;
    }

    setSecurityLoading(true);
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'CHANGE_CREDENTIAL',
        currentCredential: changeCurrentCredential,
        newAuthType: changeNewAuthType,
        newCredential: changeNewCredential,
      });

      if (result.success) {
        setSecurityType(changeNewAuthType);
        setShowChangeModal(false);
        resetChangeModal();
      } else {
        setSecurityError(result.error || 'Failed to change credential');
      }
    } catch {
      setSecurityError('Failed to change credential');
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleViewRecoveryPhrase = async () => {
    setSecurityError(null);
    setSecurityLoading(true);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'GET_RECOVERY_PHRASE',
        credential: recoveryCredential,
      });

      if (result.success) {
        setRecoveryPhrase(result.phrase);
      } else {
        setSecurityError(result.error || 'Failed to get recovery phrase');
      }
    } catch {
      setSecurityError('Failed to get recovery phrase');
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleDisableSecurity = async () => {
    setSecurityError(null);
    setSecurityLoading(true);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'DISABLE_SECURITY',
        credential: disableCredential,
      });

      if (result.success) {
        setSecurityEnabled(false);
        setShowDisableModal(false);
        resetDisableModal();
      } else {
        setSecurityError(result.error || 'Failed to disable security');
      }
    } catch {
      setSecurityError('Failed to disable security');
    } finally {
      setSecurityLoading(false);
    }
  };

  const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSetupModal) {
          e.preventDefault();
          setShowSetupModal(false);
          resetSetupModal();
        } else if (showChangeModal) {
          e.preventDefault();
          setShowChangeModal(false);
          resetChangeModal();
        } else if (showRecoveryModal) {
          e.preventDefault();
          setShowRecoveryModal(false);
          resetRecoveryModal();
        } else if (showDisableModal) {
          e.preventDefault();
          setShowDisableModal(false);
          resetDisableModal();
        }
      } else if (e.key === 'Enter') {
        if (showSetupModal && !securityLoading) {
          e.preventDefault();
          if (setupStep === 'create') {
            handleSetupSecurity();
          } else if (setupStep === 'recovery' && setupAcknowledged) {
            handleFinishSetup();
          }
        } else if (showChangeModal && !securityLoading) {
          e.preventDefault();
          handleChangeCredential();
        } else if (showRecoveryModal && !securityLoading) {
          e.preventDefault();
          if (!recoveryPhrase) {
            handleViewRecoveryPhrase();
          } else {
            setShowRecoveryModal(false);
            resetRecoveryModal();
          }
        } else if (showDisableModal && !securityLoading) {
          e.preventDefault();
          handleDisableSecurity();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSetupModal, showChangeModal, showRecoveryModal, showDisableModal,
      setupStep, setupAcknowledged, securityLoading, recoveryPhrase]);

  return (
    <>
      <Card className="bg-card border-0 mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Wallet Protection</Label>
              <p className="text-xs text-muted-foreground">
                {securityEnabled
                  ? `Protected with ${securityType === 'pin' ? 'PIN' : 'Password'}`
                  : 'No protection enabled'}
              </p>
            </div>
            <Badge className={securityEnabled ? 'bg-green-500/20 text-green-500 border-0' : 'bg-yellow-500/20 text-yellow-500 border-0'}>
              {securityEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>

          <Separator className="bg-border" />

          {securityEnabled ? (
            <div className="space-y-3">
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => {
                  resetChangeModal();
                  setChangeNewAuthType(securityType);
                  setShowChangeModal(true);
                }}
              >
                <KeyRound className="h-4 w-4 mr-2" />
                Change {securityType === 'pin' ? 'PIN' : 'Password'}
              </Button>

              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => {
                  resetRecoveryModal();
                  setShowRecoveryModal(true);
                }}
              >
                <Eye className="h-4 w-4 mr-2" />
                View Recovery Phrase
              </Button>

              <Button
                variant="secondary"
                className="w-full justify-start text-red-400 hover:text-red-300"
                onClick={() => {
                  resetDisableModal();
                  setShowDisableModal(true);
                }}
              >
                <ShieldOff className="h-4 w-4 mr-2" />
                Disable Security
              </Button>
            </div>
          ) : (
            <Button
              className="w-full bg-green-500 hover:bg-green-600"
              onClick={() => {
                resetSetupModal();
                setShowSetupModal(true);
              }}
            >
              <Shield className="h-4 w-4 mr-2" />
              Enable Security
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={showSetupModal} onOpenChange={(open) => {
        setShowSetupModal(open);
        if (!open) resetSetupModal();
      }}>
        <DialogContent className="bg-popover border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">
              {setupStep === 'create' ? 'Enable Security' : 'Recovery Phrase'}
            </DialogTitle>
          </DialogHeader>

          {setupStep === 'create' ? (
            <div className="space-y-4">
              <Tabs value={setupAuthType} onValueChange={(v) => setSetupAuthType(v as 'pin' | 'password')} className="w-full">
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

              <CredentialForm
                authType={setupAuthType}
                credential={setupCredential}
                onCredentialChange={setSetupCredential}
                confirmCredential={setupConfirmCredential}
                onConfirmChange={setSetupConfirmCredential}
                showPassword={setupShowPassword}
                onToggleShow={() => setSetupShowPassword(!setupShowPassword)}
              />

              {securityError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {securityError}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setShowSetupModal(false)}>
                  Cancel
                  <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
                    Esc
                  </Badge>
                </Button>
                <Button className="flex-1" onClick={handleSetupSecurity} disabled={securityLoading}>
                  {securityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
                    Continue
                    <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
                      Enter
                    </Badge>
                  </>}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Save this phrase to recover your wallet if you forget your {setupAuthType}
              </p>

              <SeedPhraseDisplay phrase={setupRecoveryPhrase} />

              <Button
                variant="secondary"
                className="w-full"
                onClick={() => copyToClipboard(setupRecoveryPhrase, setSetupCopied)}
              >
                {setupCopied ? (
                  <><Check className="h-4 w-4 mr-2" /> Copied!</>
                ) : (
                  <><Copy className="h-4 w-4 mr-2" /> Copy Phrase</>
                )}
              </Button>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-500 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>Write this down and store it safely. You will need it to recover your wallet.</span>
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={setupAcknowledged}
                  onChange={(e) => setSetupAcknowledged(e.target.checked)}
                  className="rounded"
                />
                I have saved my recovery phrase
              </label>

              {securityError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {securityError}
                </div>
              )}

              <Button className="w-full" onClick={handleFinishSetup} disabled={!setupAcknowledged}>
                Finish Setup
                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
                  Enter
                </Badge>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showChangeModal} onOpenChange={(open) => {
        setShowChangeModal(open);
        if (!open) resetChangeModal();
      }}>
        <DialogContent className="bg-popover border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Change {securityType === 'pin' ? 'PIN' : 'Password'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Current {securityType === 'pin' ? 'PIN' : 'Password'}</Label>
              <div className="relative">
                <Input
                  type={changeShowPassword ? 'text' : 'password'}
                  inputMode={securityType === 'pin' ? 'numeric' : undefined}
                  pattern={securityType === 'pin' ? '[0-9]*' : undefined}
                  placeholder={securityType === 'pin' ? '••••' : '••••••'}
                  value={changeCurrentCredential}
                  onChange={(e) => setChangeCurrentCredential(e.target.value)}
                  maxLength={securityType === 'pin' ? 6 : 50}
                  className="bg-card border-input pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setChangeShowPassword(!changeShowPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  {changeShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Separator className="bg-border" />

            <Tabs value={changeNewAuthType} onValueChange={(v) => setChangeNewAuthType(v as 'pin' | 'password')} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-card">
                <TabsTrigger value="pin">PIN</TabsTrigger>
                <TabsTrigger value="password">Password</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-2">
              <Label>New {changeNewAuthType === 'pin' ? 'PIN' : 'Password'}</Label>
              <Input
                type={changeShowPassword ? 'text' : 'password'}
                inputMode={changeNewAuthType === 'pin' ? 'numeric' : undefined}
                pattern={changeNewAuthType === 'pin' ? '[0-9]*' : undefined}
                placeholder={changeNewAuthType === 'pin' ? '••••' : '••••••'}
                value={changeNewCredential}
                onChange={(e) => setChangeNewCredential(e.target.value)}
                maxLength={changeNewAuthType === 'pin' ? 6 : 50}
                className="bg-card border-input"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label>Confirm New {changeNewAuthType === 'pin' ? 'PIN' : 'Password'}</Label>
              <Input
                type={changeShowPassword ? 'text' : 'password'}
                inputMode={changeNewAuthType === 'pin' ? 'numeric' : undefined}
                pattern={changeNewAuthType === 'pin' ? '[0-9]*' : undefined}
                placeholder={changeNewAuthType === 'pin' ? '••••' : '••••••'}
                value={changeConfirmCredential}
                onChange={(e) => setChangeConfirmCredential(e.target.value)}
                maxLength={changeNewAuthType === 'pin' ? 6 : 50}
                className="bg-card border-input"
                autoComplete="new-password"
              />
            </div>

            {securityError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {securityError}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowChangeModal(false)}>
                Cancel
                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
                  Esc
                </Badge>
              </Button>
              <Button className="flex-1" onClick={handleChangeCredential} disabled={securityLoading}>
                {securityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
                  Save
                  <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
                    Enter
                  </Badge>
                </>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRecoveryModal} onOpenChange={(open) => {
        setShowRecoveryModal(open);
        if (!open) resetRecoveryModal();
      }}>
        <DialogContent className="bg-popover border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Recovery Phrase</DialogTitle>
          </DialogHeader>

          {!recoveryPhrase ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Enter your {securityType} to view your recovery phrase
              </p>

              <div className="space-y-2">
                <Label>{securityType === 'pin' ? 'PIN' : 'Password'}</Label>
                <div className="relative">
                  <Input
                    type={recoveryShowPassword ? 'text' : 'password'}
                    inputMode={securityType === 'pin' ? 'numeric' : undefined}
                    pattern={securityType === 'pin' ? '[0-9]*' : undefined}
                    placeholder={securityType === 'pin' ? '••••' : '••••••'}
                    value={recoveryCredential}
                    onChange={(e) => setRecoveryCredential(e.target.value)}
                    maxLength={securityType === 'pin' ? 6 : 50}
                    className="bg-card border-input pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setRecoveryShowPassword(!recoveryShowPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                  >
                    {recoveryShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {securityError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {securityError}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setShowRecoveryModal(false)}>
                  Cancel
                  <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
                    Esc
                  </Badge>
                </Button>
                <Button className="flex-1" onClick={handleViewRecoveryPhrase} disabled={securityLoading}>
                  {securityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
                    View
                    <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
                      Enter
                    </Badge>
                  </>}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <SeedPhraseDisplay phrase={recoveryPhrase} />

              <Button
                variant="secondary"
                className="w-full"
                onClick={() => copyToClipboard(recoveryPhrase, setRecoveryCopied)}
              >
                {recoveryCopied ? (
                  <><Check className="h-4 w-4 mr-2" /> Copied!</>
                ) : (
                  <><Copy className="h-4 w-4 mr-2" /> Copy Phrase</>
                )}
              </Button>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-500 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>Keep this phrase safe and private. Anyone with this phrase can recover your wallet.</span>
              </div>

              <Button className="w-full" onClick={() => setShowRecoveryModal(false)}>
                Done
                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
                  Enter
                </Badge>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDisableModal} onOpenChange={(open) => {
        setShowDisableModal(open);
        if (!open) resetDisableModal();
      }}>
        <DialogContent className="bg-popover border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Disable Security</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>This will remove PIN/Password protection from your wallet. Anyone with access to your browser will be able to use your funds.</span>
            </div>

            <div className="space-y-2">
              <Label>Enter your {securityType} to confirm</Label>
              <div className="relative">
                <Input
                  type={disableShowPassword ? 'text' : 'password'}
                  inputMode={securityType === 'pin' ? 'numeric' : undefined}
                  pattern={securityType === 'pin' ? '[0-9]*' : undefined}
                  placeholder={securityType === 'pin' ? '••••' : '••••••'}
                  value={disableCredential}
                  onChange={(e) => setDisableCredential(e.target.value)}
                  maxLength={securityType === 'pin' ? 6 : 50}
                  className="bg-card border-input pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setDisableShowPassword(!disableShowPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  {disableShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {securityError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {securityError}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowDisableModal(false)}>
                Cancel
                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
                  Esc
                </Badge>
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDisableSecurity}
                disabled={securityLoading}
              >
                {securityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
                  Disable
                  <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
                    Enter
                  </Badge>
                </>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
