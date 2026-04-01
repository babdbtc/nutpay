import { useState, useEffect } from 'react';
import type { Settings, ThemeId } from '../shared/types';
import { DEFAULT_SETTINGS, THEMES } from '../shared/constants';
import { applyTheme } from '../shared/theme';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export function GeneralSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }).then((data) => {
      const loaded = { ...DEFAULT_SETTINGS, ...data };
      setSettings(loaded);
      applyTheme(loaded.theme || 'midnight');
    }).catch((err) => console.error('Failed to load settings:', err));
  }, []);

  const updateSetting = async (key: keyof Settings, value: unknown) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { [key]: value },
    });
    if (key === 'theme') {
      applyTheme(value as ThemeId);
    }
  };

  return (
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
            <Label className="text-sm font-medium">Auto-claim ecash tokens</Label>
            <p className="text-xs text-muted-foreground">
              Automatically claim ecash tokens found on web pages
            </p>
          </div>
          <Switch
            checked={settings.autoClaimTokens}
            onCheckedChange={(v) => updateSetting('autoClaimTokens', v)}
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

        <Separator className="bg-border" />

        <div className="flex items-center justify-between py-2">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Show balance on icon</Label>
            <p className="text-xs text-muted-foreground">
              Display wallet balance on the extension icon badge
            </p>
          </div>
          <Switch
            checked={settings.showBadgeBalance}
            onCheckedChange={(v) => updateSetting('showBadgeBalance', v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
