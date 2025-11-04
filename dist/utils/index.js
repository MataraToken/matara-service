"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractOrValidateTelegramID = exports.decryptPrivateKey = exports.encryptPrivateKey = exports.generateBSCWallet = exports.generateReferralCode = void 0;
exports.capitalizeText = capitalizeText;
const ethers_1 = require("ethers");
const crypto_1 = __importDefault(require("crypto"));
const generateReferralCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let referralCode = "";
    for (let i = 0; i < 8; i++) {
        referralCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return referralCode;
};
exports.generateReferralCode = generateReferralCode;
const generateBSCWallet = () => {
    const wallet = ethers_1.ethers.Wallet.createRandom();
    return {
        address: wallet.address,
        privateKey: wallet.privateKey
    };
};
exports.generateBSCWallet = generateBSCWallet;
const encryptPrivateKey = (privateKey, password) => {
    const algorithm = 'aes-256-gcm';
    const key = crypto_1.default.scryptSync(password, 'salt', 32);
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
};
exports.encryptPrivateKey = encryptPrivateKey;
const decryptPrivateKey = (encryptedData, password) => {
    const algorithm = 'aes-256-gcm';
    const key = crypto_1.default.scryptSync(password, 'salt', 32);
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto_1.default.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};
exports.decryptPrivateKey = decryptPrivateKey;
const extractOrValidateTelegramID = (input) => {
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
exports.extractOrValidateTelegramID = extractOrValidateTelegramID;
function capitalizeText(text) {
    return text.replace(/\b\w/g, char => char.toUpperCase());
}
//# sourceMappingURL=index.js.map