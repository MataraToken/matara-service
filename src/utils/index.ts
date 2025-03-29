export const generateReferralCode = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let referralCode = "";
    for (let i = 0; i < 8; i++) {
      referralCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return referralCode;
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
  
  export function capitalizeText(text : string) {
    return text.replace(/\b\w/g, char => char.toUpperCase());
  }