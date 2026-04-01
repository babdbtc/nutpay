import { useState, useEffect } from 'react';
import type { AllowlistEntry, Settings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';
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
  const [editAutoApprove, setEditAutoApprove] = useState(false);

  useEffect(() => {
    Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_ALLOWLIST' }),
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
    ]).then(([allowlistData, settingsData]) => {
      setAllowlist(allowlistData || []);
      if (settingsData?.displayFormat) {
        setDisplayFormat(settingsData.displayFormat);
      }
    }).catch((err) => console.error('Failed to load allowlist:', err));
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
                      {formatAmount(entry.maxPerDay, displayFormat)}/day
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
