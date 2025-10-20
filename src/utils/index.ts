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

export const encryptPrivateKey = (privateKey: string, password: string): string => {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(password, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
};

export const decryptPrivateKey = (encryptedData: string, password: string): string => {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(password, 'salt', 32);

  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

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