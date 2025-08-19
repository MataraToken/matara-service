"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractOrValidateTelegramID = exports.generateReferralCode = void 0;
exports.capitalizeText = capitalizeText;
const generateReferralCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let referralCode = "";
    for (let i = 0; i < 8; i++) {
        referralCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return referralCode;
};
exports.generateReferralCode = generateReferralCode;
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