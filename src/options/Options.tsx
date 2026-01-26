import { useState, useEffect } from 'react';
import type { Settings, MintConfig, AllowlistEntry } from '../shared/types';
import { PRESET_MINTS, DEFAULT_SETTINGS } from '../shared/constants';
import { formatAmount } from '../shared/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [settingsData, mintsData, allowlistData] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
        chrome.runtime.sendMessage({ type: 'GET_MINTS' }),
        chrome.runtime.sendMessage({ type: 'GET_ALLOWLIST' }),
      ]);
      setSettings(settingsData || DEFAULT_SETTINGS);
      setMints(mintsData || PRESET_MINTS);
      setAllowlist(allowlistData || []);
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

  if (loading) {
    return (
      <div className="options-container bg-[#16162a] min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="options-container bg-[#16162a] min-h-screen text-white">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-primary mb-2">Nutpay Settings</h1>
        <p className="text-muted-foreground">
          Configure your Cashu wallet and payment preferences
        </p>
      </div>

      {/* General Settings */}
      <Card className="bg-[#252542] border-0 mb-6">
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

          <Separator className="bg-[#333]" />

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

          <Separator className="bg-[#333]" />

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
              <SelectTrigger className="w-32 bg-[#1a1a2e] border-[#374151]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#252542] border-[#374151]">
                <SelectItem value="symbol"> Symbol</SelectItem>
                <SelectItem value="text">sats</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator className="bg-[#333]" />

          <div className="flex items-center justify-between py-2">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Wallet source</Label>
              <p className="text-xs text-muted-foreground">
                Where to get proofs for payments
              </p>
            </div>
            <Select
              value={settings.preferredWallet}
              onValueChange={(v) => updateSetting('preferredWallet', v as Settings['preferredWallet'])}
            >
              <SelectTrigger className="w-40 bg-[#1a1a2e] border-[#374151]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#252542] border-[#374151]">
                <SelectItem value="builtin">Built-in wallet</SelectItem>
                <SelectItem value="nwc">Nostr Wallet Connect</SelectItem>
                <SelectItem value="nip60">NIP-60 Wallet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {settings.preferredWallet === 'nwc' && (
            <div className="pt-2">
              <Input
                placeholder="NWC connection string (nostr+walletconnect://...)"
                value={settings.nwcConnectionString || ''}
                onChange={(e) => updateSetting('nwcConnectionString', e.target.value)}
                className="bg-[#1a1a2e] border-[#374151]"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mints */}
      <Card className="bg-[#252542] border-0 mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Mints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mints.map((mint) => (
            <div
              key={mint.url}
              className="flex items-center justify-between p-3 bg-[#1a1a2e] rounded-lg"
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
              className="bg-[#1a1a2e] border-[#374151] flex-1"
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
      <Card className="bg-[#252542] border-0">
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
                  <div className="flex items-center justify-between p-3 bg-[#1a1a2e] rounded-lg">
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
                    <div className="mt-2 p-3 bg-[#1a1a2e] rounded-lg space-y-3">
                      <div className="flex items-center gap-2">
                        <Label className="flex-1 text-xs text-muted-foreground">
                          Max per payment (sats)
                        </Label>
                        <Input
                          type="number"
                          className="w-24 bg-[#252542] border-[#374151] text-right text-sm"
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
                          className="w-24 bg-[#252542] border-[#374151] text-right text-sm"
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
    </div>
  );
}

export default Options;
