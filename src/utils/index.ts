import { ethers } from 'ethers';
import crypto from 'crypto';

export const generateReferralCode = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let referralCode = "";
  for (let i = 0; i < 8; i++) {
    referralCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return referralCode;
};

export const generateBSCWallet = () => {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey
  };
};

/**
 * Encrypt private key with per-encryption salt
 * Format: salt:iv:authTag:encrypted
 * This ensures each encryption uses a unique salt for better security
 */
export const encryptPrivateKey = (privateKey: string, password: string): string => {
  if (!password || password.length < 16) {
    throw new Error('Encryption password must be at least 16 characters long');
  }

  const algorithm = 'aes-256-gcm';
  
  // Generate a unique salt for each encryption (32 bytes)
  const salt = crypto.randomBytes(32);
  
  // Derive key using scrypt with the unique salt
  const key = crypto.scryptSync(password, salt, 32);
  
  // Generate random IV
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: salt:iv:authTag:encrypted
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
};

/**
 * Decrypt private key using salt from encrypted data
 * Format: salt:iv:authTag:encrypted
 */
export const decryptPrivateKey = (encryptedData: string, password: string): string => {
  if (!password || password.length < 16) {
    throw new Error('Encryption password must be at least 16 characters long');
  }

  const algorithm = 'aes-256-gcm';
  
  const parts = encryptedData.split(':');
  
  // Support both old format (iv:authTag:encrypted) and new format (salt:iv:authTag:encrypted)
  let salt: Buffer;
  let iv: Buffer;
  let authTag: Buffer;
  let encrypted: string;

  if (parts.length === 3) {
    // Old format (backward compatibility): iv:authTag:encrypted
    // Use environment variable salt or default (less secure but maintains compatibility)
    const saltString = process.env.WALLET_ENCRYPTION_SALT || 'default-salt-change-in-production';
    salt = Buffer.from(saltString, 'utf8');
    iv = Buffer.from(parts[0], 'hex');
    authTag = Buffer.from(parts[1], 'hex');
    encrypted = parts[2];
  } else if (parts.length === 4) {
    // New format: salt:iv:authTag:encrypted
    salt = Buffer.from(parts[0], 'hex');
    iv = Buffer.from(parts[1], 'hex');
    authTag = Buffer.from(parts[2], 'hex');
    encrypted = parts[3];
  } else {
    throw new Error('Invalid encrypted data format');
  }

  // Derive key using the salt from encrypted data
  const key = crypto.scryptSync(password, salt, 32);

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

export const extractOrValidateTelegramID = (input) => {
  const linkRegex = /^https:\/\/t\.me\/([a-zA-Z0-9_]{5,32})$/;
  const idRegex = /^@([a-zA-Z0-9_]{5,32})$/;

  let match = input.match(linkRegex);
  if (match) {
    return `@${match[1]}`;
  }

  match = input.match(idRegex);
  if (match) {
    return input; // The input is already a valid ID with @
  }

  return null; // Return null if neither a valid link nor a valid ID
};

export function capitalizeText(text: string) {
  return text.replace(/\b\w/g, char => char.toUpperCase());
}