/**
 * Environment variable validation
 * Ensures all required security-related environment variables are set
 */

interface EnvConfig {
  required: string[];
  optional: { [key: string]: string | undefined };
}

const requiredEnvVars = [
  'MONGO_URL',
  'JWT_SECRET',
  'WALLET_ENCRYPTION_PASSWORD',
  'TELEGRAM_BOT_TOKEN',
  'SERVER_URL',
  'BOT_WEBHOOK_PATH',
];

const optionalEnvVars: { [key: string]: string | undefined } = {
  BSC_RPC_URL: 'https://bsc-dataseed1.binance.org/',
  SYSTEM_WALLET_ADDRESS: undefined,
  SYSTEM_ENCRYPTED_PRIVATE_KEY: undefined,
  SWAP_FEE_PERCENTAGE: '1.0',
  FEE_RECIPIENT_ADDRESS: undefined,
  ADMIN_IP_WHITELIST: undefined,
  MIN_GAS_RESERVE_BNB: '0.001',
  LOG_LEVEL: 'info',
  NODE_ENV: 'development',
  PORT: '4000',
};

/**
 * Validate environment variables
 */
export const validateEnv = (): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Check required variables
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      errors.push(`Required environment variable ${varName} is not set`);
    }
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters long');
    }
    if (process.env.JWT_SECRET === 'secret' || process.env.JWT_SECRET === 'default-secret') {
      errors.push('JWT_SECRET must not use default/example values');
    }
  }

  // Validate WALLET_ENCRYPTION_PASSWORD strength
  if (process.env.WALLET_ENCRYPTION_PASSWORD) {
    if (process.env.WALLET_ENCRYPTION_PASSWORD.length < 16) {
      errors.push('WALLET_ENCRYPTION_PASSWORD must be at least 16 characters long');
    }
    if (
      process.env.WALLET_ENCRYPTION_PASSWORD === 'default-encryption-key' ||
      process.env.WALLET_ENCRYPTION_PASSWORD === 'password'
    ) {
      errors.push('WALLET_ENCRYPTION_PASSWORD must not use default/example values');
    }
  }

  // Validate BSC_RPC_URL format
  if (process.env.BSC_RPC_URL) {
    try {
      new URL(process.env.BSC_RPC_URL);
    } catch {
      errors.push('BSC_RPC_URL must be a valid URL');
    }
  }

  // Validate wallet addresses if provided
  if (process.env.SYSTEM_WALLET_ADDRESS) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(process.env.SYSTEM_WALLET_ADDRESS)) {
      errors.push('SYSTEM_WALLET_ADDRESS must be a valid Ethereum/BSC address');
    }
  }

  // Validate numeric values
  if (process.env.SWAP_FEE_PERCENTAGE) {
    const fee = parseFloat(process.env.SWAP_FEE_PERCENTAGE);
    if (isNaN(fee) || fee < 0 || fee > 100) {
      errors.push('SWAP_FEE_PERCENTAGE must be a number between 0 and 100');
    }
  }

  if (process.env.MIN_GAS_RESERVE_BNB) {
    const gas = parseFloat(process.env.MIN_GAS_RESERVE_BNB);
    if (isNaN(gas) || gas < 0) {
      errors.push('MIN_GAS_RESERVE_BNB must be a positive number');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Get admin IP whitelist from environment
 */
export const getAdminIPWhitelist = (): string[] => {
  const whitelist = process.env.ADMIN_IP_WHITELIST;
  if (!whitelist) {
    return [];
  }
  return whitelist.split(',').map((ip) => ip.trim()).filter((ip) => ip.length > 0);
};

/**
 * Get transaction limits from environment
 */
export const getTransactionLimits = () => {
  return {
    maxAmountPerTransaction: parseFloat(process.env.MAX_AMOUNT_PER_TRANSACTION || '1000'),
    maxAmountPerDay: parseFloat(process.env.MAX_AMOUNT_PER_DAY || '10000'),
    maxTransactionsPerDay: parseInt(process.env.MAX_TRANSACTIONS_PER_DAY || '50', 10),
  };
};

