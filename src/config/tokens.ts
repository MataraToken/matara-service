/**
 * Supported Token Registry
 * 
 * This file contains the list of tokens that are supported for:
 * - Sending (transfers)
 * - Receiving (deposits)
 * - Swapping (DEX swaps via LiFi)
 * 
 * All addresses are for BSC Mainnet.
 */

export interface TokenInfo {
  symbol: string;
  name: string;
  address: string; // Contract address or 'native' for BNB
  logo: string;
  decimals: number;
}

export type SupportedTokenSymbol = 
  | 'MARS' 
  | 'BNB' 
  | 'WKC' 
  | 'DTG' 
  | 'YUKAN' 
  | 'TWD' 
  | 'TKC' 
  | 'ETH' 
  | 'USDT';

export const SUPPORTED_TOKENS: Record<SupportedTokenSymbol, TokenInfo> = {
  'MARS': {
    symbol: 'MARS',
    name: 'MARS Token',
    address: '0x6844B2e9afB002d188A072A3ef0FBb068650F214', // BSC Mainnet MARS
    logo: 'https://cdn.dexscreener.com/cms/images/d33c76a1c7bb23e4de0e83553377c191453dfc36f114393a0e012ea509060908?width=128&height=128&fit=crop&quality=95&format=auto',
    decimals: 18
  },
  'BNB': {
    symbol: 'BNB',
    name: 'BNB',
    address: 'native', // Native BNB
    logo: '',
    decimals: 18
  },
  'WKC': {
    symbol: 'WKC',
    name: 'WKC Token',
    address: '0x6Ec90334d89dBdc89E08A133271be3d104128Edb', // BSC Mainnet WKC
    logo: '',
    decimals: 18
  },
  'DTG': {
    symbol: 'DTG',
    name: 'DTG Token',
    address: '0xb1957bdba889686ebde631df970ece6a7571a1b6', // BSC Mainnet DTG
    logo: '',
    decimals: 18
  },
  'YUKAN': {
    symbol: 'YUKAN',
    name: 'YUKAN Token',
    address: '0xd086B849a71867731D74D6bB5Df4f640de900171', // BSC Mainnet YUKAN
    logo: '',
    decimals: 18
  },
  'TWD': {
    symbol: 'TWD',
    name: 'TWD Token',
    address: '0xf00cd9366a13e725ab6764ee6fc8bd21da22786e', // BSC Mainnet TWD
    logo: '',
    decimals: 18
  },
  'TKC': {
    symbol: 'TKC',
    name: 'TKC Token',
    address: '0x06dc293c250e2fb2416a4276d291803fc74fb9b5', // BSC Mainnet TKC
    logo: '',
    decimals: 18
  },
  'ETH': {
    symbol: 'ETH',
    name: 'Ethereum Token',
    address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', // BSC Mainnet ETH
    logo: '',
    decimals: 18
  },
  'USDT': {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0x55d398326f99059fF775485246999027B3197955', // BSC Mainnet USDT
    logo: '',
    decimals: 18
  }
};

/**
 * Native BNB indicators that should be treated as BNB
 */
export const NATIVE_BNB_INDICATORS = [
  'native',
  '0x0000000000000000000000000000000000000000',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB address
];

/**
 * Get token info by address (case-insensitive)
 */
export function getTokenByAddress(address: string): TokenInfo | null {
  const normalizedAddress = address.toLowerCase();
  
  // Check for native BNB
  if (NATIVE_BNB_INDICATORS.includes(normalizedAddress)) {
    return SUPPORTED_TOKENS.BNB;
  }
  
  // Check all tokens
  for (const token of Object.values(SUPPORTED_TOKENS)) {
    if (token.address.toLowerCase() === normalizedAddress) {
      return token;
    }
  }
  
  return null;
}

/**
 * Get token info by symbol (case-insensitive)
 */
export function getTokenBySymbol(symbol: string): TokenInfo | null {
  const normalizedSymbol = symbol.toUpperCase() as SupportedTokenSymbol;
  return SUPPORTED_TOKENS[normalizedSymbol] || null;
}

/**
 * Check if a token address is supported
 */
export function isTokenSupported(address: string): boolean {
  return getTokenByAddress(address) !== null;
}

/**
 * Get all supported tokens as an array
 */
export function getAllSupportedTokens(): TokenInfo[] {
  return Object.values(SUPPORTED_TOKENS);
}

/**
 * Get supported token addresses (for validation)
 */
export function getSupportedTokenAddresses(): string[] {
  return Object.values(SUPPORTED_TOKENS)
    .map(token => token.address.toLowerCase())
    .concat(NATIVE_BNB_INDICATORS.map(ind => ind.toLowerCase()));
}
