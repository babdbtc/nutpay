import { getWalletVersion, hasSeed, storeSeed, needsMigration } from '../storage/seed-store';
import { getProofs } from '../storage/proof-store';
import { getTotalBalance } from '../storage/proof-store';
import { WALLET_VERSIONS } from '../../shared/constants';
import { mnemonicToSeed, generateMnemonic } from '../security/auth';

export interface MigrationStatus {
  needsMigration: boolean;
  currentVersion: number;
  targetVersion: number;
  hasExistingProofs: boolean;
  existingBalance: number;
}

export interface MigrationResult {
  success: boolean;
  migratedVersion: number;
  mnemonic?: string; // Only returned on new seed creation
  error?: string;
}

/**
 * Check if wallet needs migration
 */
export async function checkMigrationStatus(): Promise<MigrationStatus> {
  const currentVersion = await getWalletVersion();
  const needs = await needsMigration();
  const proofs = await getProofs();
  const balance = await getTotalBalance();

  return {
    needsMigration: needs,
    currentVersion,
    targetVersion: WALLET_VERSIONS.V2_DETERMINISTIC,
    hasExistingProofs: proofs.length > 0,
    existingBalance: balance,
  };
}

/**
 * Migrate wallet to v2 with a new seed
 * - Existing proofs remain valid (they use random secrets)
 * - New proofs will use deterministic secrets
 */
export async function migrateToV2WithNewSeed(): Promise<MigrationResult> {
  try {
    const seedExists = await hasSeed();
    if (seedExists) {
      return {
        success: true,
        migratedVersion: WALLET_VERSIONS.V2_DETERMINISTIC,
      };
    }

    // Generate new mnemonic and derive seed
    const mnemonic = generateMnemonic();
    const seed = mnemonicToSeed(mnemonic);

    // Store the seed
    await storeSeed(seed);

    return {
      success: true,
      migratedVersion: WALLET_VERSIONS.V2_DETERMINISTIC,
      mnemonic,
    };
  } catch (error) {
    return {
      success: false,
      migratedVersion: await getWalletVersion(),
      error: error instanceof Error ? error.message : 'Migration failed',
    };
  }
}

/**
 * Migrate wallet to v2 with an existing mnemonic
 * Use this when user is restoring from a backup
 */
export async function migrateToV2WithExistingMnemonic(mnemonic: string): Promise<MigrationResult> {
  try {
    const seed = mnemonicToSeed(mnemonic);
    await storeSeed(seed);

    return {
      success: true,
      migratedVersion: WALLET_VERSIONS.V2_DETERMINISTIC,
    };
  } catch (error) {
    return {
      success: false,
      migratedVersion: await getWalletVersion(),
      error: error instanceof Error ? error.message : 'Migration failed',
    };
  }
}

/**
 * Check if current wallet is using deterministic secrets
 */
export async function isDeterministicWallet(): Promise<boolean> {
  const version = await getWalletVersion();
  const seedExists = await hasSeed();
  return version >= WALLET_VERSIONS.V2_DETERMINISTIC && seedExists;
}

/**
 * Get migration prompt message based on wallet state
 */
export function getMigrationPrompt(status: MigrationStatus): {
  title: string;
  message: string;
  action: string;
} {
  if (status.hasExistingProofs) {
    return {
      title: 'Upgrade Available',
      message: `Your wallet has ${status.existingBalance} sats. Upgrade to enable seed-based recovery. Your existing funds will remain accessible.`,
      action: 'Create Recovery Seed',
    };
  }

  return {
    title: 'Secure Your Wallet',
    message: 'Create a recovery seed phrase to backup your wallet. You can restore your balance on any device with this seed.',
    action: 'Create Seed',
  };
}
