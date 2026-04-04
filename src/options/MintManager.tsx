import { useState, useEffect } from 'react';
import type { MintConfig } from '../shared/types';
import { PRESET_MINTS } from '../shared/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export function MintManager() {
  const [mints, setMints] = useState<MintConfig[]>([]);
  const [newMintUrl, setNewMintUrl] = useState('');

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_MINTS' }).then((data) => {
      setMints(data || PRESET_MINTS);
    }).catch((err) => console.error('Failed to load mints:', err));
  }, []);

  const toggleMint = async (url: string, enabled: boolean) => {
    const updated = mints.map((m) => m.url === url ? { ...m, enabled } : m);
    setMints(updated);
    await chrome.runtime.sendMessage({ type: 'UPDATE_MINT', url, updates: { enabled } });
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
    const result = await chrome.runtime.sendMessage({ type: 'ADD_MINT', mint: newMint });
    setMints(result || [...mints, newMint]);
    setNewMintUrl('');
  };

  const removeMint = async (url: string) => {
    const result = await chrome.runtime.sendMessage({ type: 'REMOVE_MINT', url });
    setMints(result || mints.filter((m) => m.url !== url));
  };

  return (
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
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMint(); } }}
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
  );
}
