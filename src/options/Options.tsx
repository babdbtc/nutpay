import { useState, useEffect } from 'react';
import type { Settings, MintConfig, AllowlistEntry, ThemeId } from '../shared/types';
import { PRESET_MINTS, DEFAULT_SETTINGS, THEMES } from '../shared/constants';
import { formatAmount } from '../shared/format';
import { applyTheme } from '../shared/theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Shield, ShieldOff, Eye, EyeOff, KeyRound, AlertCircle, Check, Copy } from 'lucide-react';

function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [mints, setMints] = useState<MintConfig[]>([]);
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [newMintUrl, setNewMintUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editMaxPerPayment, setEditMaxPerPayment] = useState('');
  const [editMaxPerDay, setEditMaxPerDay] = useState('');
  const [editAutoApprove, setEditAutoApprove] = useState(false);

  // Security state
  const [securityEnabled, setSecurityEnabled] = useState(false);
  const [securityType, setSecurityType] = useState<'pin' | 'password'>('pin');
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  // Setup modal state
  const [setupAuthType, setSetupAuthType] = useState<'pin' | 'password'>('pin');
  const [setupCredential, setSetupCredential] = useState('');
  const [setupConfirmCredential, setSetupConfirmCredential] = useState('');
  const [setupShowPassword, setSetupShowPassword] = useState(false);
  const [setupRecoveryPhrase, setSetupRecoveryPhrase] = useState('');
  const [setupStep, setSetupStep] = useState<'create' | 'recovery'>('create');
  const [setupCopied, setSetupCopied] = useState(false);
  const [setupAcknowledged, setSetupAcknowledged] = useState(false);

  // Change credential modal state
  const [changeCurrentCredential, setChangeCurrentCredential] = useState('');
  const [changeNewAuthType, setChangeNewAuthType] = useState<'pin' | 'password'>('pin');
  const [changeNewCredential, setChangeNewCredential] = useState('');
  const [changeConfirmCredential, setChangeConfirmCredential] = useState('');
  const [changeShowPassword, setChangeShowPassword] = useState(false);

  // View recovery phrase modal state
  const [recoveryCredential, setRecoveryCredential] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [recoveryShowPassword, setRecoveryShowPassword] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);

  // Disable security modal state
  const [disableCredential, setDisableCredential] = useState('');
  const [disableShowPassword, setDisableShowPassword] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [settingsData, mintsData, allowlistData, securityData] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
        chrome.runtime.sendMessage({ type: 'GET_MINTS' }),
        chrome.runtime.sendMessage({ type: 'GET_ALLOWLIST' }),
        chrome.runtime.sendMessage({ type: 'GET_SECURITY_CONFIG' }),
      ]);
      // Merge with defaults to ensure new settings fields have values
      const loadedSettings = { ...DEFAULT_SETTINGS, ...settingsData };
      setSettings(loadedSettings);
      setMints(mintsData || PRESET_MINTS);
      setAllowlist(allowlistData || []);
      if (securityData) {
        setSecurityEnabled(securityData.enabled || false);
        setSecurityType(securityData.type || 'pin');
      }
      // Apply theme
      applyTheme(loadedSettings.theme || 'classic');
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key: keyof Settings, value: unknown) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { [key]: value },
    });
    // Apply theme immediately when changed
    if (key === 'theme') {
      applyTheme(value as ThemeId);
    }
  };

  const toggleMint = async (url: string, enabled: boolean) => {
    const updated = mints.map((m) =>
      m.url === url ? { ...m, enabled } : m
    );
    setMints(updated);
    await chrome.runtime.sendMessage({
      type: 'UPDATE_MINT',
      url,
      updates: { enabled },
    });
  };

  const addMint = async () => {
    if (!newMintUrl.trim()) return;

    try {
      new URL(newMintUrl);
    } catch {
      alert('Invalid URL');
      return;
    }

    const newMint: MintConfig = {
      url: newMintUrl.trim(),
      name: new URL(newMintUrl).hostname,
      enabled: true,
      trusted: false,
    };

    const result = await chrome.runtime.sendMessage({
      type: 'ADD_MINT',
      mint: newMint,
    });
    setMints(result || [...mints, newMint]);
    setNewMintUrl('');
  };

  const removeMint = async (url: string) => {
    const result = await chrome.runtime.sendMessage({
      type: 'REMOVE_MINT',
      url,
    });
    setMints(result || mints.filter((m) => m.url !== url));
  };

  const removeFromAllowlist = async (origin: string) => {
    await chrome.runtime.sendMessage({
      type: 'REMOVE_FROM_ALLOWLIST',
      origin,
    });
    setAllowlist(allowlist.filter((e) => e.origin !== origin));
  };

  const startEditingEntry = (entry: AllowlistEntry) => {
    setEditingEntry(entry.origin);
    setEditMaxPerPayment(String(entry.maxPerPayment));
    setEditMaxPerDay(String(entry.maxPerDay));
    setEditAutoApprove(entry.autoApprove);
  };

  const cancelEditing = () => {
    setEditingEntry(null);
    setEditMaxPerPayment('');
    setEditMaxPerDay('');
    setEditAutoApprove(false);
  };

  const saveEntryEdits = async (entry: AllowlistEntry) => {
    const maxPerPayment = parseInt(editMaxPerPayment, 10) || 100;
    const maxPerDay = parseInt(editMaxPerDay, 10) || 1000;

    const updatedEntry: AllowlistEntry = {
      ...entry,
      maxPerPayment,
      maxPerDay,
      autoApprove: editAutoApprove,
    };

    await chrome.runtime.sendMessage({
      type: 'UPDATE_ALLOWLIST_ENTRY',
      entry: updatedEntry,
    });

    setAllowlist(
      allowlist.map((e) =>
        e.origin === entry.origin ? updatedEntry : e
      )
    );
    cancelEditing();
  };

  // Security functions
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

    // Validate
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

    // Validate new credential
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

  // Keyboard shortcuts for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          // Allow Escape to close modal even when in input
        } else {
          return;
        }
      }

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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSetupModal, showChangeModal, showRecoveryModal, showDisableModal]);

  if (loading) {
    return (
      <div className="options-container bg-background min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="options-container bg-background min-h-screen text-white">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-primary mb-2">Nutpay Settings</h1>
        <p className="text-muted-foreground">
          Configure your Cashu wallet and payment preferences
        </p>
      </div>

      {/* General Settings */}
      <Card className="bg-card border-0 mb-6">
        <CardHeader>
          <CardTitle className="text-lg">General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Always ask before paying</Label>
              <p className="text-xs text-muted-foreground">
                Show approval popup for every payment request
              </p>
            </div>
            <Switch
              checked={settings.alwaysAsk}
              onCheckedChange={(v) => updateSetting('alwaysAsk', v)}
            />
          </div>

          <Separator className="bg-border" />

          <div className="flex items-center justify-between py-2">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Auto-discover mints</Label>
              <p className="text-xs text-muted-foreground">
                Automatically add new mints from payment requests
              </p>
            </div>
            <Switch
              checked={settings.autoDiscoverMints}
              onCheckedChange={(v) => updateSetting('autoDiscoverMints', v)}
            />
          </div>

          <Separator className="bg-border" />

          <div className="flex items-center justify-between py-2">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Display format</Label>
              <p className="text-xs text-muted-foreground">
                {settings.displayFormat === 'symbol' ? '10 (Bitcoin symbol)' : '10 sats (text)'}
              </p>
            </div>
            <Select
              value={settings.displayFormat}
              onValueChange={(v) => updateSetting('displayFormat', v as Settings['displayFormat'])}
            >
              <SelectTrigger className="w-32 bg-popover border-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-input">
                <SelectItem value="symbol"> Symbol</SelectItem>
                <SelectItem value="text">sats</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator className="bg-border" />

          <div className="py-2">
            <div className="space-y-1 mb-3">
              <Label className="text-sm font-medium">Theme</Label>
              <p className="text-xs text-muted-foreground">
                Choose your preferred color scheme
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => updateSetting('theme', theme.id)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    settings.theme === theme.id
                      ? 'border-primary'
                      : 'border-transparent hover:border-muted-foreground/30'
                  }`}
                  style={{ backgroundColor: theme.preview.bg }}
                >
                  <div className="flex flex-col gap-1.5">
                    <div
                      className="h-8 rounded"
                      style={{ backgroundColor: theme.preview.card }}
                    >
                      <div
                        className="h-2 w-8 rounded-full mt-3 ml-2"
                        style={{ backgroundColor: theme.preview.accent }}
                      />
                    </div>
                    <span className="text-xs font-medium" style={{ color: theme.preview.accent }}>
                      {theme.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <Separator className="bg-border" />

          <div className="flex items-center justify-between py-2">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Animations</Label>
              <p className="text-xs text-muted-foreground">
                Show animations for payments and actions
              </p>
            </div>
            <Switch
              checked={settings.enableAnimations}
              onCheckedChange={(v) => updateSetting('enableAnimations', v)}
            />
          </div>


        </CardContent>
      </Card>

      {/* Security */}
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

      {/* Mints */}
      <Card className="bg-card border-0 mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Mints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mints.map((mint) => (
            <div
              key={mint.url}
              className="flex items-center justify-between p-3 bg-popover rounded-lg"
            >
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-sm font-medium">{mint.name}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                  {mint.url}
                </span>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {mint.trusted && (
                  <Badge className="bg-green-500/20 text-green-500 border-0">
                    Trusted
                  </Badge>
                )}
                <Switch
                  checked={mint.enabled}
                  onCheckedChange={(v) => toggleMint(mint.url, v)}
                />
                {!PRESET_MINTS.some((p) => p.url === mint.url) && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeMint(mint.url)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-4">
            <Input
              placeholder="Add mint URL..."
              value={newMintUrl}
              onChange={(e) => setNewMintUrl(e.target.value)}
              className="bg-popover border-input flex-1"
            />
            <Button
              className="bg-green-500 hover:bg-green-600"
              onClick={addMint}
            >
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Allowed Sites */}
      <Card className="bg-card border-0">
        <CardHeader>
          <CardTitle className="text-lg">Allowed Sites</CardTitle>
        </CardHeader>
        <CardContent>
          {allowlist.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              No sites have been approved yet. Sites will appear here when you
              approve payments and select "Remember this site".
            </p>
          ) : (
            <div className="space-y-3">
              {allowlist.map((entry) => (
                <div key={entry.origin}>
                  <div className="flex items-center justify-between p-3 bg-popover rounded-lg">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">
                        {new URL(entry.origin).hostname}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Max {formatAmount(entry.maxPerPayment, settings.displayFormat)}/payment,{' '}
                        {formatAmount(entry.maxPerDay, settings.displayFormat)}/day
                        {entry.autoApprove && ' (auto-approve)'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => startEditingEntry(entry)}>
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => removeFromAllowlist(entry.origin)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>

                  {editingEntry === entry.origin && (
                    <div className="mt-2 p-3 bg-popover rounded-lg space-y-3">
                      <div className="flex items-center gap-2">
                        <Label className="flex-1 text-xs text-muted-foreground">
                          Max per payment (sats)
                        </Label>
                        <Input
                          type="number"
                          className="w-24 bg-card border-input text-right text-sm"
                          value={editMaxPerPayment}
                          onChange={(e) => setEditMaxPerPayment(e.target.value)}
                          min="1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="flex-1 text-xs text-muted-foreground">
                          Max per day (sats)
                        </Label>
                        <Input
                          type="number"
                          className="w-24 bg-card border-input text-right text-sm"
                          value={editMaxPerDay}
                          onChange={(e) => setEditMaxPerDay(e.target.value)}
                          min="1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="flex-1 text-xs text-muted-foreground">
                          Auto-approve payments within limits
                        </Label>
                        <Switch
                          checked={editAutoApprove}
                          onCheckedChange={(v) => setEditAutoApprove(v)}
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={cancelEditing}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveEntryEdits(entry)}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup Security Modal */}
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

              <div className="space-y-2">
                <Label>{setupAuthType === 'pin' ? 'PIN' : 'Password'}</Label>
                <div className="relative">
                  <Input
                    type={setupShowPassword ? 'text' : 'password'}
                    inputMode={setupAuthType === 'pin' ? 'numeric' : undefined}
                    pattern={setupAuthType === 'pin' ? '[0-9]*' : undefined}
                    placeholder={setupAuthType === 'pin' ? '••••' : '••••••'}
                    value={setupCredential}
                    onChange={(e) => setSetupCredential(e.target.value)}
                    maxLength={setupAuthType === 'pin' ? 6 : 50}
                    className="bg-card border-input pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setSetupShowPassword(!setupShowPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                  >
                    {setupShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Confirm {setupAuthType === 'pin' ? 'PIN' : 'Password'}</Label>
                <Input
                  type={setupShowPassword ? 'text' : 'password'}
                  inputMode={setupAuthType === 'pin' ? 'numeric' : undefined}
                  pattern={setupAuthType === 'pin' ? '[0-9]*' : undefined}
                  placeholder={setupAuthType === 'pin' ? '••••' : '••••••'}
                  value={setupConfirmCredential}
                  onChange={(e) => setSetupConfirmCredential(e.target.value)}
                  maxLength={setupAuthType === 'pin' ? 6 : 50}
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
                <Button variant="secondary" className="flex-1" onClick={() => setShowSetupModal(false)}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleSetupSecurity} disabled={securityLoading}>
                  {securityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Save this phrase to recover your wallet if you forget your {setupAuthType}
              </p>

              <Card className="bg-card border-0">
                <CardContent className="p-4">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    {setupRecoveryPhrase.split(' ').map((word, i) => (
                      <div key={i} className="bg-popover rounded p-2 text-center">
                        <span className="text-muted-foreground text-xs mr-1">{i + 1}.</span>
                        <span className="text-white">{word}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

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
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Credential Modal */}
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
              </Button>
              <Button className="flex-1" onClick={handleChangeCredential} disabled={securityLoading}>
                {securityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Recovery Phrase Modal */}
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
                </Button>
                <Button className="flex-1" onClick={handleViewRecoveryPhrase} disabled={securityLoading}>
                  {securityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'View'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
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
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Disable Security Modal */}
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
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDisableSecurity}
                disabled={securityLoading}
              >
                {securityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disable'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Options;
