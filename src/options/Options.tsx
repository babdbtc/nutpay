import React, { useState, useEffect } from 'react';
import type { Settings, MintConfig, AllowlistEntry } from '../shared/types';
import { PRESET_MINTS, DEFAULT_SETTINGS } from '../shared/constants';
import { formatAmount } from '../shared/format';

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  header: {
    marginBottom: '16px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#f7931a',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#888',
  },
  section: {
    background: '#252542',
    borderRadius: '12px',
    padding: '24px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '16px',
  },
  setting: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #333',
  },
  settingLast: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
  },
  settingInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  settingLabel: {
    fontSize: '14px',
    fontWeight: 500,
  },
  settingDesc: {
    fontSize: '12px',
    color: '#888',
  },
  toggle: {
    position: 'relative',
    width: '48px',
    height: '24px',
  },
  toggleInput: {
    opacity: 0,
    width: 0,
    height: 0,
  },
  toggleSlider: {
    position: 'absolute',
    cursor: 'pointer',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: '#374151',
    borderRadius: '24px',
    transition: 'background 0.2s',
  },
  toggleSliderActive: {
    background: '#22c55e',
  },
  toggleKnob: {
    position: 'absolute',
    height: '18px',
    width: '18px',
    left: '3px',
    bottom: '3px',
    background: 'white',
    borderRadius: '50%',
    transition: 'transform 0.2s',
  },
  toggleKnobActive: {
    transform: 'translateX(24px)',
  },
  select: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #374151',
    background: '#1a1a2e',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
  },
  mintList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  mintItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: '#1a1a2e',
    borderRadius: '8px',
  },
  mintInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  mintName: {
    fontSize: '14px',
    fontWeight: 500,
  },
  mintUrl: {
    fontSize: '12px',
    color: '#666',
    maxWidth: '300px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  mintActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  badge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: '#374151',
    color: '#888',
  },
  trustedBadge: {
    background: '#22c55e33',
    color: '#22c55e',
  },
  addMint: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #374151',
    background: '#1a1a2e',
    color: '#fff',
    fontSize: '14px',
  },
  button: {
    padding: '10px 16px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  primaryBtn: {
    background: '#22c55e',
    color: 'white',
  },
  secondaryBtn: {
    background: '#374151',
    color: '#ccc',
  },
  dangerBtn: {
    background: '#ef4444',
    color: 'white',
  },
  allowlistItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: '#1a1a2e',
    borderRadius: '8px',
  },
  allowlistInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  allowlistOrigin: {
    fontSize: '14px',
    fontWeight: 500,
  },
  allowlistLimits: {
    fontSize: '12px',
    color: '#888',
  },
  empty: {
    textAlign: 'center',
    color: '#666',
    padding: '24px',
    fontSize: '14px',
  },
  nwcSection: {
    marginTop: '16px',
  },
  editForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginTop: '12px',
    padding: '12px',
    background: '#1a1a2e',
    borderRadius: '8px',
  },
  editRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  editLabel: {
    flex: 1,
    fontSize: '13px',
    color: '#888',
  },
  editInput: {
    width: '100px',
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid #374151',
    background: '#252542',
    color: '#fff',
    fontSize: '13px',
    textAlign: 'right',
  },
  editActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  smallBtn: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '12px',
    cursor: 'pointer',
  },
};

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={styles.toggle}>
      <input
        type="checkbox"
        style={styles.toggleInput}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        style={{
          ...styles.toggleSlider,
          ...(checked ? styles.toggleSliderActive : {}),
        }}
      >
        <span
          style={{
            ...styles.toggleKnob,
            ...(checked ? styles.toggleKnobActive : {}),
          }}
        />
      </span>
    </label>
  );
}

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
      <div style={styles.container}>
        <div style={styles.empty}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Nutpay Settings</h1>
        <p style={styles.subtitle}>
          Configure your Cashu wallet and payment preferences
        </p>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>General</h2>

        <div style={styles.setting}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Always ask before paying</span>
            <span style={styles.settingDesc}>
              Show approval popup for every payment request
            </span>
          </div>
          <Toggle
            checked={settings.alwaysAsk}
            onChange={(v) => updateSetting('alwaysAsk', v)}
          />
        </div>

        <div style={styles.setting}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Auto-discover mints</span>
            <span style={styles.settingDesc}>
              Automatically add new mints from payment requests
            </span>
          </div>
          <Toggle
            checked={settings.autoDiscoverMints}
            onChange={(v) => updateSetting('autoDiscoverMints', v)}
          />
        </div>

        <div style={styles.setting}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Display format</span>
            <span style={styles.settingDesc}>
              {settings.displayFormat === 'symbol' ? '₿10 (Bitcoin symbol)' : '10 sats (text)'}
            </span>
          </div>
          <select
            style={styles.select}
            value={settings.displayFormat}
            onChange={(e) =>
              updateSetting('displayFormat', e.target.value as Settings['displayFormat'])
            }
          >
            <option value="symbol">₿ Symbol</option>
            <option value="text">sats</option>
          </select>
        </div>

        <div style={styles.settingLast}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Wallet source</span>
            <span style={styles.settingDesc}>
              Where to get proofs for payments
            </span>
          </div>
          <select
            style={styles.select}
            value={settings.preferredWallet}
            onChange={(e) =>
              updateSetting(
                'preferredWallet',
                e.target.value as Settings['preferredWallet']
              )
            }
          >
            <option value="builtin">Built-in wallet</option>
            <option value="nwc">Nostr Wallet Connect</option>
            <option value="nip60">NIP-60 Wallet</option>
          </select>
        </div>

        {settings.preferredWallet === 'nwc' && (
          <div style={styles.nwcSection}>
            <input
              style={styles.input}
              placeholder="NWC connection string (nostr+walletconnect://...)"
              value={settings.nwcConnectionString || ''}
              onChange={(e) =>
                updateSetting('nwcConnectionString', e.target.value)
              }
            />
          </div>
        )}
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Mints</h2>

        <div style={styles.mintList}>
          {mints.map((mint) => (
            <div key={mint.url} style={styles.mintItem}>
              <div style={styles.mintInfo}>
                <span style={styles.mintName}>{mint.name}</span>
                <span style={styles.mintUrl}>{mint.url}</span>
              </div>
              <div style={styles.mintActions}>
                {mint.trusted && (
                  <span style={{ ...styles.badge, ...styles.trustedBadge }}>
                    Trusted
                  </span>
                )}
                <Toggle
                  checked={mint.enabled}
                  onChange={(v) => toggleMint(mint.url, v)}
                />
                {!PRESET_MINTS.some((p) => p.url === mint.url) && (
                  <button
                    style={{ ...styles.button, ...styles.dangerBtn }}
                    onClick={() => removeMint(mint.url)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={styles.addMint}>
          <input
            style={styles.input}
            placeholder="Add mint URL..."
            value={newMintUrl}
            onChange={(e) => setNewMintUrl(e.target.value)}
          />
          <button
            style={{ ...styles.button, ...styles.primaryBtn }}
            onClick={addMint}
          >
            Add
          </button>
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Allowed Sites</h2>

        {allowlist.length === 0 ? (
          <div style={styles.empty}>
            No sites have been approved yet. Sites will appear here when you
            approve payments and select "Remember this site".
          </div>
        ) : (
          <div style={styles.mintList}>
            {allowlist.map((entry) => (
              <div key={entry.origin}>
                <div style={styles.allowlistItem}>
                  <div style={styles.allowlistInfo}>
                    <span style={styles.allowlistOrigin}>
                      {new URL(entry.origin).hostname}
                    </span>
                    <span style={styles.allowlistLimits}>
                      Max {formatAmount(entry.maxPerPayment, settings.displayFormat)}/payment, {formatAmount(entry.maxPerDay, settings.displayFormat)}/day
                      {entry.autoApprove && ' (auto-approve)'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      style={{ ...styles.button, ...styles.primaryBtn }}
                      onClick={() => startEditingEntry(entry)}
                    >
                      Edit
                    </button>
                    <button
                      style={{ ...styles.button, ...styles.secondaryBtn }}
                      onClick={() => removeFromAllowlist(entry.origin)}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {editingEntry === entry.origin && (
                  <div style={styles.editForm}>
                    <div style={styles.editRow}>
                      <span style={styles.editLabel}>Max per payment (sats)</span>
                      <input
                        type="number"
                        style={styles.editInput}
                        value={editMaxPerPayment}
                        onChange={(e) => setEditMaxPerPayment(e.target.value)}
                        min="1"
                      />
                    </div>
                    <div style={styles.editRow}>
                      <span style={styles.editLabel}>Max per day (sats)</span>
                      <input
                        type="number"
                        style={styles.editInput}
                        value={editMaxPerDay}
                        onChange={(e) => setEditMaxPerDay(e.target.value)}
                        min="1"
                      />
                    </div>
                    <div style={styles.editRow}>
                      <span style={styles.editLabel}>Auto-approve payments within limits</span>
                      <Toggle
                        checked={editAutoApprove}
                        onChange={(v) => setEditAutoApprove(v)}
                      />
                    </div>
                    <div style={styles.editActions}>
                      <button
                        style={{ ...styles.smallBtn, ...styles.secondaryBtn }}
                        onClick={cancelEditing}
                      >
                        Cancel
                      </button>
                      <button
                        style={{ ...styles.smallBtn, ...styles.primaryBtn }}
                        onClick={() => saveEntryEdits(entry)}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Options;
