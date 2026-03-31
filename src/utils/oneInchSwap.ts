/**
 * 1inch Classic Swap API integration for BSC (chainId 56).
 * Uses Swap API v6.1: quote, approve, swap.
 * API key from 1inch Developer Portal (Bearer token).
 */

import { ethers } from 'ethers';
import { decryptPrivateKey } from './index';

const BSC_CHAIN_ID = 56;
const ONE_INCH_API_BASE = `https://api.1inch.com/swap/v6.1/${BSC_CHAIN_ID}`;
const ONE_INCH_API_KEY = process.env.ONE_INCH_API_KEY || '';

const WBNB_BSC = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

function getBSCProvider(): ethers.JsonRpcProvider {
  const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
  return new ethers.JsonRpcProvider(rpcUrl);
}

function getWalletSigner(encryptedPrivateKey: string, walletAddress: string): ethers.Wallet {
  const provider = getBSCProvider();
  const password = process.env.WALLET_ENCRYPTION_PASSWORD || 'default-encryption-key';
  const privateKey = decryptPrivateKey(encryptedPrivateKey, password);
  return new ethers.Wallet(privateKey, provider);
}

function isNativeBNB(tokenAddress: string): boolean {
  const t = tokenAddress.toLowerCase();
  return (
    t === WBNB_BSC.toLowerCase() ||
    t === ethers.ZeroAddress.toLowerCase() ||
    t === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  );
}

async function getTokenDecimals(tokenAddress: string, provider: ethers.Provider): Promise<number> {
  if (isNativeBNB(tokenAddress)) return 18;
  const c = new ethers.Contract(tokenAddress, ['function decimals() view returns (uint8)'], provider);
  try {
    return await c.decimals();
  } catch {
    return 18;
  }
}

function parseTokenAmount(amount: string, decimals: number): bigint {
  const clean = amount.includes('.') ? amount.replace(/\.?0+$/, '').replace(/\.$/, '') : amount;
  return ethers.parseUnits(clean || '0', decimals);
}

async function wrapBNBToWBNB(amount: bigint, signer: ethers.Wallet): Promise<string> {
  const wbnb = new ethers.Contract(
    WBNB_BSC,
    ['function deposit() payable', 'function withdraw(uint256 wad)'],
    signer
  );
  const tx = await wbnb.deposit({ value: amount });
  const receipt = await tx.wait();
  return receipt!.hash;
}

async function call1inch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(ONE_INCH_API_BASE + path);
  url.search = new URLSearchParams(params).toString();
  const headers: HeadersInit = { Accept: 'application/json' };
  if (ONE_INCH_API_KEY) headers['Authorization'] = `Bearer ${ONE_INCH_API_KEY}`;
  const res = await fetch(url.toString(), { method: 'GET', headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`1inch API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// Response types from 1inch API
interface OneInchSwapTx {
  to: string;
  data: string;
  value: string;
  gas?: number;
}

interface OneInchSwapResponse {
  tx: OneInchSwapTx;
  toAmount?: string;
  toToken?: { address: string; decimals: number };
}

interface OneInchQuoteResponse {
  toAmount?: string;
  toToken?: { address: string; decimals: number };
}

interface OneInchAllowanceResponse {
  allowance: string;
}

interface OneInchApproveTxResponse {
  to: string;
  data: string;
  value: string;
}

export interface OneInchSwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOutMin?: string;
  walletAddress: string;
  encryptedPrivateKey: string;
  slippageTolerance?: number;
  feeRecipientAddress?: string;
  feeAmount?: string;
}

export interface OneInchSwapResult {
  success: boolean;
  transactionHash?: string;
  amountOut?: string;
  error?: string;
}

/**
 * Get a quote for a swap (expected output amount).
 */
export async function getOneInchQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  walletAddress: string,
  slippageTolerance: number = 1
): Promise<{ amountOut: string; quote?: OneInchQuoteResponse }> {
  const provider = getBSCProvider();
  let src = tokenIn;
  let dst = tokenOut;
  if (isNativeBNB(tokenIn)) src = WBNB_BSC;
  if (isNativeBNB(tokenOut)) dst = WBNB_BSC;

  const decimals = await getTokenDecimals(tokenIn, provider);
  const amountWei = parseTokenAmount(amountIn, decimals).toString();

  const swapRes = await call1inch<OneInchSwapResponse>('/swap', {
    src: src.toLowerCase(),
    dst: dst.toLowerCase(),
    amount: amountWei,
    from: walletAddress.toLowerCase(),
    slippage: slippageTolerance.toString(),
    disableEstimate: 'false',
    allowPartialFill: 'false',
  });

  const toAmount = swapRes.toAmount;
  if (!toAmount) {
    throw new Error('1inch API did not return expected output amount');
  }

  const dstDecimals = swapRes.toToken?.decimals ?? await getTokenDecimals(dst, provider);
  const amountOut = ethers.formatUnits(toAmount, dstDecimals);
  return { amountOut, quote: swapRes as unknown as OneInchQuoteResponse };
}

/**
 * Execute a swap using 1inch Classic Swap API.
 */
export async function executeOneInchSwap(params: OneInchSwapParams): Promise<OneInchSwapResult> {
  try {
    const {
      tokenIn,
      tokenOut,
      amountIn,
      walletAddress,
      encryptedPrivateKey,
      slippageTolerance = 1,
      feeRecipientAddress,
      feeAmount,
    } = params;

    const provider = getBSCProvider();
    const signer = getWalletSigner(encryptedPrivateKey, walletAddress);
    if (signer.address.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error('Wallet address mismatch');
    }

    let src = tokenIn;
    let dst = tokenOut;
    if (isNativeBNB(tokenIn)) src = WBNB_BSC;
    if (isNativeBNB(tokenOut)) dst = WBNB_BSC;

    const tokenInDecimals = await getTokenDecimals(tokenIn, provider);
    let actualAmount = amountIn;
    if (feeAmount && parseFloat(feeAmount) > 0) {
      actualAmount = (parseFloat(amountIn) - parseFloat(feeAmount)).toFixed(18);
    }
    const amountWei = parseTokenAmount(actualAmount, tokenInDecimals);

    // Balance check
    if (!isNativeBNB(tokenIn)) {
      const tokenContract = new ethers.Contract(
        tokenIn,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      const balance = await tokenContract.balanceOf(walletAddress);
      const required = parseTokenAmount(amountIn, tokenInDecimals);
      if (balance < required) {
        return {
          success: false,
          error: `Insufficient balance: have ${ethers.formatUnits(balance, tokenInDecimals)}, need ${amountIn}`,
        };
      }
    } else {
      const balance = await provider.getBalance(walletAddress);
      const required = parseTokenAmount(amountIn, 18);
      const gasBuffer = process.env.SWAP_BNB_GAS_BUFFER || '0.001';
      if (balance < required + ethers.parseEther(gasBuffer)) {
        return {
          success: false,
          error: `Insufficient BNB balance. Have ${ethers.formatEther(balance)}, need ${amountIn} + gas`,
        };
      }
    }

    // Optional: send fee first (same pattern as 0x)
    if (feeAmount && feeRecipientAddress && parseFloat(feeAmount) > 0) {
      const feeWei = parseTokenAmount(feeAmount, tokenInDecimals);
      if (isNativeBNB(tokenIn)) {
        const tx = await signer.sendTransaction({ to: feeRecipientAddress, value: feeWei });
        await tx.wait();
      } else {
        const tokenContract = new ethers.Contract(
          tokenIn,
          ['function transfer(address,uint256) returns (bool)'],
          signer
        );
        const tx = await tokenContract.transfer(feeRecipientAddress, feeWei);
        await tx.wait();
      }
    }

    // Wrap BNB -> WBNB if selling native BNB
    if (isNativeBNB(tokenIn)) {
      await wrapBNBToWBNB(amountWei, signer);
    }

    // 1inch router on BSC (Aggregation Router); optional: GET /approve/spender for dynamic address
    let routerAddress = '0x11111112542D85B3EF69AE05771c2dCCff4fAa26';
    try {
      const routerRes = await call1inch<{ address?: string }>('/approve/spender', {});
      if (routerRes.address) routerAddress = routerRes.address;
    } catch {
      // use default BSC router
    }

    // Check allowance and approve if needed (for ERC20 / WBNB)
    const allowanceRes = await call1inch<OneInchAllowanceResponse>('/approve/allowance', {
      tokenAddress: src,
      walletAddress: walletAddress.toLowerCase(),
    });
    const allowance = BigInt(allowanceRes.allowance || '0');
    if (allowance < amountWei) {
      const approveRes = await call1inch<OneInchApproveTxResponse>('/approve/transaction', {
        tokenAddress: src,
        amount: amountWei.toString(),
      });
      const approveTx = await signer.sendTransaction({
        to: approveRes.to,
        data: approveRes.data,
        value: BigInt(approveRes.value || '0'),
      });
      await approveTx.wait();
    }

    // Get swap transaction
    const swapRes = await call1inch<OneInchSwapResponse>('/swap', {
      src: src.toLowerCase(),
      dst: dst.toLowerCase(),
      amount: amountWei.toString(),
      from: walletAddress.toLowerCase(),
      slippage: slippageTolerance.toString(),
      disableEstimate: 'false',
      allowPartialFill: 'false',
    });

    const { to, data, value, gas } = swapRes.tx;
    const txRequest: ethers.TransactionRequest = {
      to,
      data,
      value: BigInt(value || '0'),
    };
    if (gas) txRequest.gasLimit = gas;

    const tx = await signer.sendTransaction(txRequest);
    const receipt = await tx.wait();
    if (!receipt) {
      return { success: false, error: 'Transaction failed (no receipt)' };
    }
    if (receipt.status === 0) {
      return {
        success: false,
        error: `Transaction reverted. Check BSCScan: https://bscscan.com/tx/${receipt.hash}`,
        transactionHash: receipt.hash,
      };
    }

    const tokenOutDecimals = await getTokenDecimals(tokenOut, provider);
    const amountOut = swapRes.toAmount
      ? ethers.formatUnits(swapRes.toAmount, swapRes.toToken?.decimals ?? tokenOutDecimals)
      : '';

    return {
      success: true,
      transactionHash: receipt.hash,
      amountOut: amountOut || undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
