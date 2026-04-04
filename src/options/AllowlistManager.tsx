import { useState, useEffect } from 'react';
import type { AllowlistEntry, MintConfig, Settings } from '../shared/types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../shared/constants';
import { formatAmount } from '../shared/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function AllowlistManager() {
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [displayFormat, setDisplayFormat] = useState<Settings['displayFormat']>(DEFAULT_SETTINGS.displayFormat);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editMaxPerPayment, setEditMaxPerPayment] = useState('');
  const [editMaxPerDay, setEditMaxPerDay] = useState('');
  const [editMaxPerMonth, setEditMaxPerMonth] = useState('');
  const [editAutoApprove, setEditAutoApprove] = useState(false);
  const [editPreferredMint, setEditPreferredMint] = useState<string | null>(null);
  const [mints, setMints] = useState<MintConfig[]>([]);

  const loadAllowlistData = async () => {
    const [allowlistData, settingsData, mintsData] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_ALLOWLIST' }),
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
      chrome.runtime.sendMessage({ type: 'GET_MINTS' }),
    ]);

    setAllowlist(allowlistData || []);
    if (settingsData?.displayFormat) {
      setDisplayFormat(settingsData.displayFormat);
    }
    setMints(mintsData || []);
  };

  useEffect(() => {
    loadAllowlistData().catch((err) => console.error('Failed to load allowlist:', err));

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;

      if (
        changes[STORAGE_KEYS.ALLOWLIST]
        || changes[STORAGE_KEYS.SETTINGS]
        || changes[STORAGE_KEYS.MINTS]
      ) {
        loadAllowlistData().catch((err) => console.error('Failed to refresh allowlist:', err));
      }
    };

    const handleWindowFocus = () => {
      loadAllowlistData().catch((err) => console.error('Failed to refresh allowlist:', err));
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingEntry) {
        e.preventDefault();
        cancelEditing();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingEntry]);

  const removeFromAllowlist = async (origin: string) => {
    await chrome.runtime.sendMessage({ type: 'REMOVE_FROM_ALLOWLIST', origin });
    setAllowlist(allowlist.filter((e) => e.origin !== origin));
  };

  const startEditingEntry = (entry: AllowlistEntry) => {
    setEditingEntry(entry.origin);
    setEditMaxPerPayment(String(entry.maxPerPayment));
    setEditMaxPerDay(String(entry.maxPerDay));
    setEditMaxPerMonth(String(entry.maxPerMonth ?? 10000));
    setEditAutoApprove(entry.autoApprove);
    setEditPreferredMint(entry.preferredMint ?? null);
  };

  const cancelEditing = () => {
    setEditingEntry(null);
    setEditMaxPerPayment('');
    setEditMaxPerDay('');
    setEditMaxPerMonth('');
    setEditAutoApprove(false);
    setEditPreferredMint(null);
  };

  const saveEntryEdits = async (entry: AllowlistEntry) => {
    const maxPerPayment = parseInt(editMaxPerPayment, 10) || 100;
    const maxPerDay = parseInt(editMaxPerDay, 10) || 1000;
    const maxPerMonth = parseInt(editMaxPerMonth, 10) || 10000;
    const updatedEntry: AllowlistEntry = {
      ...entry,
      maxPerPayment,
      maxPerDay,
      maxPerMonth,
      preferredMint: editPreferredMint,
      autoApprove: editAutoApprove,
    };
    await chrome.runtime.sendMessage({ type: 'UPDATE_ALLOWLIST_ENTRY', entry: updatedEntry });
    setAllowlist(allowlist.map((e) => e.origin === entry.origin ? updatedEntry : e));
    cancelEditing();
  };

  return (
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
                      Max {formatAmount(entry.maxPerPayment, displayFormat)}/payment,{' '}
                      {formatAmount(entry.maxPerDay, displayFormat)}/day,{' '}
                      {formatAmount(entry.maxPerMonth ?? 10000, displayFormat)}/month
                      {entry.autoApprove && ' (auto-approve)'}
                    </span>
                    {entry.preferredMint && (
                      <span className="text-xs text-muted-foreground">
                        Preferred: {(() => { try { return new URL(entry.preferredMint).hostname; } catch { return entry.preferredMint; } })()}
                      </span>
                    )}
                    <span className="text-xs">
                      {(() => {
                        const dailySpent = entry.dailySpent ?? 0;
                        const maxDay = entry.maxPerDay;
                        const monthlySpent = entry.monthlySpent ?? 0;
                        const maxMonth = entry.maxPerMonth ?? 10000;
                        const dailyRatio = maxDay > 0 ? dailySpent / maxDay : 0;
                        const monthlyRatio = maxMonth > 0 ? monthlySpent / maxMonth : 0;
                        const dailyColor = dailyRatio >= 1 ? 'text-red-400' : dailyRatio >= 0.8 ? 'text-amber-400' : 'text-muted-foreground';
                        const monthlyColor = monthlyRatio >= 1 ? 'text-red-400' : monthlyRatio >= 0.8 ? 'text-amber-400' : 'text-muted-foreground';
                        return (
                          <>
                            <span className={dailyColor}>Today: {dailySpent}/{maxDay} sats</span>
                            {' · '}
                            <span className={monthlyColor}>Month: {monthlySpent}/{maxMonth} sats</span>
                          </>
                        );
                      })()}
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
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); saveEntryEdits(entry); } else if (e.key === 'Escape') { e.stopPropagation(); cancelEditing(); } }}
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
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); saveEntryEdits(entry); } else if (e.key === 'Escape') { e.stopPropagation(); cancelEditing(); } }}
                        min="1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="flex-1 text-xs text-muted-foreground">
                        Max per month (sats)
                      </Label>
                      <Input
                        type="number"
                        className="w-24 bg-card border-input text-right text-sm"
                        value={editMaxPerMonth}
                        onChange={(e) => setEditMaxPerMonth(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); saveEntryEdits(entry); } else if (e.key === 'Escape') { e.stopPropagation(); cancelEditing(); } }}
                        min="1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="flex-1 text-xs text-muted-foreground">
                        Preferred mint
                      </Label>
                      <select
                        className="w-40 rounded-md bg-card border border-input px-2 py-1.5 text-sm text-foreground"
                        value={editPreferredMint ?? ''}
                        onChange={(e) => setEditPreferredMint(e.target.value || null)}
                      >
                        <option value="">No preference</option>
                        {mints.map((m) => (
                          <option key={m.url} value={m.url}>
                            {m.name || m.url}
                          </option>
                        ))}
                      </select>
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
  );
}
