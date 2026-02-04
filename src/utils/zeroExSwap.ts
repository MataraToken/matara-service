import { ethers } from 'ethers';
import { createWalletClient, createPublicClient, http, erc20Abi, maxUint256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { decryptPrivateKey } from './index';
import { getTokenByAddress, getTokenBySymbol } from '../config/tokens';

// 0x API configuration
// Use the main API endpoint - it supports all chains via chainId parameter
const ZERO_EX_API_BASE_URL = 'https://api.0x.org';
const ZERO_EX_API_KEY = process.env.ZERO_EX_API_KEY || '';

// Headers for 0x API requests
const getHeaders = () => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (ZERO_EX_API_KEY) {
    headers['0x-api-key'] = ZERO_EX_API_KEY;
  }
  
  headers['0x-version'] = 'v2';
  
  return headers;
};

// WBNB address on BSC
const WBNB_ADDRESS_0X = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

// Permit2 contract address (same on all EVM chains)
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

/**
 * Get BSC provider
 */
function getBSCProvider(): ethers.JsonRpcProvider {
  const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Get wallet signer from encrypted private key
 */
function getWalletSigner(encryptedPrivateKey: string, walletAddress: string): ethers.Wallet {
  const provider = getBSCProvider();
  const encryptionPassword = process.env.WALLET_ENCRYPTION_PASSWORD || 'default-encryption-key';
  const privateKey = decryptPrivateKey(encryptedPrivateKey, encryptionPassword);
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Check if token is native BNB
 */
function isNativeBNB(tokenAddress: string): boolean {
  return (
    tokenAddress.toLowerCase() === WBNB_ADDRESS_0X.toLowerCase() ||
    tokenAddress.toLowerCase() === ethers.ZeroAddress ||
    tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  );
}

/**
 * Get token decimals
 */
async function getTokenDecimals(tokenAddress: string, provider: ethers.Provider): Promise<number> {
  if (isNativeBNB(tokenAddress)) {
    return 18;
  }
  
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ['function decimals() view returns (uint8)'],
    provider
  );
  
  try {
    return await tokenContract.decimals();
  } catch (error) {
    console.warn(`Could not fetch decimals for ${tokenAddress}, defaulting to 18`);
    return 18;
  }
}

/**
 * Wrap native BNB to WBNB
 */
async function wrapBNBToWBNB(
  amount: bigint,
  signer: ethers.Wallet
): Promise<string> {
  const wbnbContract = new ethers.Contract(
    WBNB_ADDRESS_0X,
    [
      'function deposit() payable',
      'function withdraw(uint256 wad)',
    ],
    signer
  );

  console.log(`Wrapping ${ethers.formatEther(amount)} BNB to WBNB...`);
  const tx = await wbnbContract.deposit({ value: amount });
  const receipt = await tx.wait();
  console.log(`BNB wrapped to WBNB. TX: ${receipt.hash}`);
  
  return receipt.hash;
}

/**
 * Sign Permit2 data if required by 0x quote
 */
async function signPermit2IfRequired(
  quote: any,
  walletClient: any,
  account: any
): Promise<string | null> {
  // Check if quote requires Permit2
  if (!quote.permit2 || !quote.permit2.eip712) {
    return null;
  }

  console.log('Permit2 signature required, signing...');
  
  const { domain, types, message } = quote.permit2.eip712;
  
  // Remove EIP712Domain from types if present (viem handles this automatically)
  const typesWithoutDomain = { ...types };
  delete typesWithoutDomain.EIP712Domain;
  
  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: typesWithoutDomain,
    primaryType: 'PermitWitnessTransferFrom', // Standard Permit2 type
    message,
  });
  
  console.log('Permit2 signature obtained');
  return signature;
}

/**
 * Check if wallet has sufficient BNB balance for gas fees
 */
async function checkGasBalance(
  signer: ethers.Wallet,
  estimatedGasCost?: bigint
): Promise<{ sufficient: boolean; balance: string; required: string; error?: string }> {
  try {
    const balance = await signer.provider.getBalance(signer.address);
    const balanceBNB = ethers.formatEther(balance);
    
    // Minimum required BNB for gas (0.001 BNB as a safety margin)
    const minRequiredBNB = estimatedGasCost 
      ? ethers.formatEther(estimatedGasCost)
      : '0.001'; // Default minimum
    
    const minRequiredWei = estimatedGasCost || ethers.parseEther('0.001');
    
    if (balance < minRequiredWei) {
      return {
        sufficient: false,
        balance: balanceBNB,
        required: minRequiredBNB,
        error: `Insufficient BNB for gas fees. Balance: ${balanceBNB} BNB, Required: ${minRequiredBNB} BNB. Please add BNB to your wallet for transaction fees.`,
      };
    }
    
    return {
      sufficient: true,
      balance: balanceBNB,
      required: minRequiredBNB,
    };
  } catch (error) {
    return {
      sufficient: false,
      balance: '0',
      required: '0.001',
      error: `Error checking gas balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Parse token amount to wei
 * Uses ethers.js parseUnits for better compatibility with large numbers
 */
function parseTokenAmount(amount: string, decimals: number): bigint {
  try {
    // Remove trailing zeros after decimal point to avoid parseUnits issues
    // e.g., "49500000.000000000000000000" -> "49500000"
    let cleanAmount = amount;
    if (cleanAmount.includes('.')) {
      // Remove trailing zeros and the decimal point if all zeros
      cleanAmount = cleanAmount.replace(/\.?0+$/, '');
      // If it ends with just a decimal point, remove it
      if (cleanAmount.endsWith('.')) {
        cleanAmount = cleanAmount.slice(0, -1);
      }
    }
    
    // Use ethers.js parseUnits instead of viem's parseUnits for better compatibility
    return ethers.parseUnits(cleanAmount, decimals);
  } catch (error) {
    throw new Error(`Invalid amount format: ${amount}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Swap parameters interface
 */
export interface ZeroExSwapParams {
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

/**
 * Swap result interface
 */
export interface ZeroExSwapResult {
  success: boolean;
  transactionHash?: string;
  amountOut?: string;
  error?: string;
}

/**
 * Retry helper with exponential backoff for 0x API calls
 */
async function retryZeroExCall<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRetryableError = 
      error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      error.code === 'UND_ERR_SOCKET' ||
      error.name === 'ConnectTimeoutError' ||
      error.message?.includes('fetch failed') ||
      error.message?.includes('timeout') ||
      error.message?.includes('ECONNRESET') ||
      error.message?.includes('ENOTFOUND') ||
      (error.status >= 500 && error.status < 600); // Retry on 5xx errors
    
    if (retries > 0 && isRetryableError) {
      console.warn(`0x API call failed (${error.message || error.code}), retrying in ${delayMs}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return retryZeroExCall(fn, retries - 1, delayMs * 2);
    }
    throw error;
  }
}

/**
 * Get swap quote from 0x API (simplified - uses quote endpoint only)
 * This function is kept for backward compatibility but is no longer used in executeZeroExSwap
 */
export async function getZeroExQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  walletAddress: string,
  slippageTolerance: number = 1.0
): Promise<{ amountOut: string; price: any; quote: any }> {
  try {
    const provider = getBSCProvider();
    
    // Resolve token addresses (handle native BNB)
    let sellToken = tokenIn;
    let buyToken = tokenOut;
    
    if (isNativeBNB(tokenIn)) {
      sellToken = WBNB_ADDRESS_0X; // 0x uses WBNB for native BNB
    }
    if (isNativeBNB(tokenOut)) {
      buyToken = WBNB_ADDRESS_0X;
    }
    
    // Get token decimals
    const tokenInDecimals = await getTokenDecimals(tokenIn, provider);
    const sellAmount = parseTokenAmount(amountIn, tokenInDecimals);
    
    // Use quote endpoint directly (single call)
    const quoteParams = new URLSearchParams({
      chainId: '56',
      sellToken: sellToken.toLowerCase(),
      buyToken: buyToken.toLowerCase(),
      sellAmount: sellAmount.toString(),
      taker: walletAddress.toLowerCase(),
    });

    if (slippageTolerance > 0) {
      quoteParams.append('slippagePercentage', (slippageTolerance / 100).toString());
    }

    const quoteUrl = `${ZERO_EX_API_BASE_URL}/swap/allowance-holder/quote?${quoteParams.toString()}`;
    console.log('Fetching 0x quote:', quoteUrl);
    
    const quoteResponse = await retryZeroExCall(() => 
      fetch(quoteUrl, { headers: getHeaders() })
    );
    
    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      let errorMessage = `0x API quote request failed: ${quoteResponse.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = `0x API: ${errorJson.message}`;
          if (errorJson.message.includes('no Route') || errorJson.message.includes('no route')) {
            errorMessage = `No swap routes available for this token pair. The amount may be too small (minimum: ~0.001 tokens) or the token pair may not have sufficient liquidity on 0x.`;
          }
        }
      } catch {
        errorMessage += ` ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }
    
    const quote = await quoteResponse.json();
    
    if (quote.validationErrors && quote.validationErrors.length > 0) {
      throw new Error(`0x API validation errors: ${JSON.stringify(quote.validationErrors)}`);
    }
    
    if (!quote.buyAmount) {
      throw new Error('0x API did not return buyAmount. This may indicate insufficient liquidity or an unsupported token pair.');
    }
    
    // Get token decimals for output
    const tokenOutDecimals = await getTokenDecimals(tokenOut, provider);
    const amountOut = ethers.formatUnits(quote.buyAmount, tokenOutDecimals);
    
    console.log(`0x quote: ${amountIn} ${tokenIn} -> ${amountOut} ${tokenOut}`);
    
    return {
      amountOut,
      price: quote,
      quote: quote,
    };
  } catch (error) {
    console.error('Error getting 0x quote:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to get 0x swap quote: ${error.message}`);
    }
    throw new Error('Failed to get 0x swap quote: Unknown error');
  }
}

/**
 * Execute swap using 0x API
 */
export async function executeZeroExSwap(params: ZeroExSwapParams): Promise<ZeroExSwapResult> {
  try {
    const {
      tokenIn,
      tokenOut,
      amountIn,
      amountOutMin,
      walletAddress,
      encryptedPrivateKey,
      slippageTolerance = 1.0,
      feeRecipientAddress,
      feeAmount,
    } = params;

    const provider = getBSCProvider();
    const signer = getWalletSigner(encryptedPrivateKey, walletAddress);

    // Verify wallet address matches
    if (signer.address.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error('Wallet address mismatch');
    }

    // Check BNB balance for gas fees (initial check)
    const initialGasCheck = await checkGasBalance(signer);
    if (!initialGasCheck.sufficient) {
      return {
        success: false,
        error: initialGasCheck.error || 'Insufficient BNB for gas fees',
      };
    }

    // Resolve token addresses
    let sellToken = tokenIn;
    let buyToken = tokenOut;
    
    if (isNativeBNB(tokenIn)) {
      sellToken = WBNB_ADDRESS_0X;
    }
    if (isNativeBNB(tokenOut)) {
      buyToken = WBNB_ADDRESS_0X;
    }

    // Get token decimals
    const tokenInDecimals = await getTokenDecimals(tokenIn, provider);
    
    // Calculate actual swap amount (after fee deduction)
    let actualSwapAmount = amountIn;
    if (feeAmount && parseFloat(feeAmount) > 0) {
      const amountNum = parseFloat(amountIn);
      const feeNum = parseFloat(feeAmount);
      actualSwapAmount = (amountNum - feeNum).toFixed(18);
    }
    
    const sellAmount = parseTokenAmount(actualSwapAmount, tokenInDecimals);

    // Check balance before getting quote
    if (!isNativeBNB(tokenIn)) {
      const tokenContract = new ethers.Contract(
        tokenIn,
        ['function balanceOf(address owner) view returns (uint256)'],
        provider
      );
      const balance = await tokenContract.balanceOf(walletAddress);
      const requiredAmount = parseTokenAmount(amountIn, tokenInDecimals); // Check for full amount (before fee)
      
      if (balance < requiredAmount) {
        return {
          success: false,
          error: `Insufficient balance: Have ${ethers.formatUnits(balance, tokenInDecimals)}, need ${amountIn}`,
        };
      }
    } else {
      // Check native BNB balance (include gas buffer). BSC swap gas is typically ~0.0001–0.0005 BNB.
      const balance = await provider.getBalance(walletAddress);
      const requiredAmount = parseTokenAmount(amountIn, 18);
      const gasBufferBNB = process.env.SWAP_BNB_GAS_BUFFER || '0.001';
      const gasBuffer = ethers.parseEther(gasBufferBNB);
      
      if (balance < requiredAmount + gasBuffer) {
        return {
          success: false,
          error: `Insufficient BNB balance. Have ${ethers.formatEther(balance)}, need ${amountIn} + gas`,
        };
      }
    }

    // Transfer service fee BEFORE getting quote (so quote uses correct balance)
    if (feeAmount && feeRecipientAddress && parseFloat(feeAmount) > 0) {
      console.log('Transferring service fee...');
      try {
        if (isNativeBNB(tokenIn)) {
          // Transfer native BNB
          const feeAmountWei = parseTokenAmount(feeAmount, 18);
          const tx = await signer.sendTransaction({
            to: feeRecipientAddress,
            value: feeAmountWei,
          });
          await tx.wait();
          console.log(`Service fee transferred: ${feeAmount} BNB to ${feeRecipientAddress}`);
        } else {
          // Transfer ERC20 token
          const tokenContract = new ethers.Contract(
            tokenIn,
            ['function transfer(address to, uint256 amount) returns (bool)'],
            signer
          );
          
          const feeAmountWei = parseTokenAmount(feeAmount, tokenInDecimals);
          const tx = await tokenContract.transfer(feeRecipientAddress, feeAmountWei);
          await tx.wait();
          console.log(`Service fee transferred: ${feeAmount} tokens to ${feeRecipientAddress}`);
        }
      } catch (feeError) {
        return {
          success: false,
          error: `Failed to transfer service fee: ${feeError instanceof Error ? feeError.message : 'Unknown error'}`,
        };
      }
    }

    // Step 4: Wrap BNB to WBNB if needed (for native BNB swaps)
    if (isNativeBNB(tokenIn)) {
      try {
        console.log('Wrapping native BNB to WBNB for swap...');
        await wrapBNBToWBNB(sellAmount, signer);
        console.log('BNB successfully wrapped to WBNB');
      } catch (wrapError) {
        return {
          success: false,
          error: `Failed to wrap BNB: ${wrapError instanceof Error ? wrapError.message : 'Unknown error'}`,
        };
      }
    }

    // Create viem wallet client
    const encryptionPassword = process.env.WALLET_ENCRYPTION_PASSWORD || 'default-encryption-key';
    const privateKey = decryptPrivateKey(encryptedPrivateKey, encryptionPassword);
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    
    const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
    const walletClient = createWalletClient({
      account,
      chain: bsc,
      transport: http(rpcUrl),
    });
    
    // Create public client for reading contract state
    const { createPublicClient } = await import('viem');
    const publicClient = createPublicClient({
      chain: bsc,
      transport: http(rpcUrl),
    });

    // Step 5: Get FRESH quote IMMEDIATELY before execution (Fix #1 & #4)
    const quoteParams = new URLSearchParams({
      chainId: '56',
      sellToken: sellToken.toLowerCase(),
      buyToken: buyToken.toLowerCase(),
      sellAmount: sellAmount.toString(),
      taker: walletAddress.toLowerCase(),
    });

    if (slippageTolerance > 0) {
      quoteParams.append('slippagePercentage', (slippageTolerance / 100).toString());
    }

    const quoteUrl = `${ZERO_EX_API_BASE_URL}/swap/allowance-holder/quote?${quoteParams.toString()}`;
    console.log('Fetching fresh 0x quote (immediately before execution):', quoteUrl);

    const quoteResponse = await retryZeroExCall(() =>
      fetch(quoteUrl, { headers: getHeaders() })
    );

    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      let errorMessage = `0x API quote request failed: ${quoteResponse.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = `0x API: ${errorJson.message}`;
          if (errorJson.message.includes('no Route') || errorJson.message.includes('no route')) {
            errorMessage = `No swap routes available. Amount may be too small or insufficient liquidity.`;
          }
        }
      } catch {
        errorMessage += ` ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }

    const quote = await quoteResponse.json();

    // Check quote expiration (Fix #1)
    if (quote.expiry) {
      const expiryTime = new Date(quote.expiry).getTime();
      const now = Date.now();
      const bufferMs = 5000; // 5 second safety buffer
      
      if (now > expiryTime - bufferMs) {
        throw new Error('Quote expired or about to expire. Please retry.');
      }
    }

    if (quote.validationErrors && quote.validationErrors.length > 0) {
      throw new Error(`0x API validation errors: ${JSON.stringify(quote.validationErrors)}`);
    }

    if (!quote.transaction || !quote.transaction.to || !quote.transaction.data) {
      throw new Error('0x API did not return valid transaction data');
    }

    // Check for balance issues
    if (quote.issues?.balance) {
      const balanceIssue = quote.issues.balance;
      throw new Error(
        `Insufficient balance: Expected ${balanceIssue.expected}, have ${balanceIssue.actual}`
      );
    }

    // Get output amount from quote
    const tokenOutDecimals = await getTokenDecimals(tokenOut, provider);
    const amountOut = ethers.formatUnits(quote.buyAmount, tokenOutDecimals);
    console.log(`Fresh quote: ${actualSwapAmount} -> ${amountOut}`);

    // Step 6: Handle Permit2 if required (Fix #3)
    let permit2Signature: string | null = null;
    if (quote.permit2) {
      try {
        permit2Signature = await signPermit2IfRequired(quote, walletClient, account);
        
        // Approve Permit2 contract if needed. sellToken is always an ERC20 here
        // (WBNB when user sells native BNB—we wrap first—or another token).
        const currentAllowanceForPermit2 = await publicClient.readContract({
          address: sellToken as `0x${string}`,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [walletAddress as `0x${string}`, PERMIT2_ADDRESS as `0x${string}`],
        });
        
        if (currentAllowanceForPermit2 < sellAmount) {
          console.log('Approving Permit2 to spend tokens...');
          const approveHash = await walletClient.writeContract({
            address: sellToken as `0x${string}`,
            abi: erc20Abi,
            functionName: 'approve',
            args: [PERMIT2_ADDRESS as `0x${string}`, maxUint256],
            account,
            chain: bsc,
          });
          const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
          
          if (approveReceipt.status === 'reverted') {
            return {
              success: false,
              error: 'Permit2 approval transaction reverted',
            };
          }
          console.log('Permit2 approved');
        }
      } catch (permit2Error) {
        console.error('Permit2 signing failed:', permit2Error);
        return {
          success: false,
          error: `Permit2 signing failed: ${permit2Error instanceof Error ? permit2Error.message : 'Unknown error'}`,
        };
      }
    } else if (quote.allowanceTarget && !isNativeBNB(tokenIn)) {
      // Standard approval flow (non-Permit2)
      try {
        // Check current allowance using public client
        const currentAllowance = await publicClient.readContract({
          address: sellToken as `0x${string}`,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [
            walletAddress as `0x${string}`,
            quote.allowanceTarget as `0x${string}`,
          ],
        });

        if (currentAllowance < sellAmount) {
          console.log('Approving 0x AllowanceTarget to spend tokens...');
          const approveHash = await walletClient.writeContract({
            address: sellToken as `0x${string}`,
            abi: erc20Abi,
            functionName: 'approve',
            args: [
              quote.allowanceTarget as `0x${string}`,
              maxUint256,
            ],
            account: account,
            chain: bsc,
          });
          
          const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
          if (approveReceipt.status === 'reverted') {
            return {
              success: false,
              error: 'Token approval transaction reverted. Please check your token balance and try again.',
            };
          }
          console.log('Approval transaction confirmed:', approveHash);
          
          // Re-verify allowance after approval
          const newAllowance = await publicClient.readContract({
            address: sellToken as `0x${string}`,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [
              walletAddress as `0x${string}`,
              quote.allowanceTarget as `0x${string}`,
            ],
          });
          
          if (newAllowance < sellAmount) {
            return {
              success: false,
              error: `Approval failed. Allowance: ${newAllowance.toString()}, Required: ${sellAmount.toString()}`,
            };
          }
          console.log(`Allowance verified: ${newAllowance.toString()}`);
        } else {
          console.log('Token already approved for 0x AllowanceTarget');
        }
      } catch (approvalError) {
        console.error('Error checking/approving allowance:', approvalError);
        return {
          success: false,
          error: `Token approval failed: ${approvalError instanceof Error ? approvalError.message : 'Unknown error'}`,
        };
      }
    }
    
    // Re-check balance right before execution (after approval if it happened).
    // sellToken is always an ERC20 here (WBNB for native BNB after wrap, or another token).
    const finalBalance = await publicClient.readContract({
      address: sellToken as `0x${string}`,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [walletAddress as `0x${string}`],
    });
    
    if (finalBalance < sellAmount) {
      return {
        success: false,
        error: `Insufficient balance after approval. Balance: ${ethers.formatUnits(finalBalance, tokenInDecimals)}, Required: ${actualSwapAmount}`,
      };
    }
    console.log(`Final balance check passed. Balance: ${ethers.formatUnits(finalBalance, tokenInDecimals)}`);

    // Check gas balance again before executing (after approval transaction if it happened)
    // Calculate estimated gas cost from quote
    if (quote.transaction.gas && quote.transaction.gasPrice) {
      const estimatedGasCost = BigInt(quote.transaction.gas) * BigInt(quote.transaction.gasPrice);
      const estimatedGasCheck = await checkGasBalance(signer, estimatedGasCost);
      if (!estimatedGasCheck.sufficient) {
        return {
          success: false,
          error: `Insufficient BNB for gas fees. Estimated cost: ${ethers.formatEther(estimatedGasCost)} BNB. ${estimatedGasCheck.error || ''}`,
        };
      }
      console.log(`Gas balance check passed. Estimated cost: ${ethers.formatEther(estimatedGasCost)} BNB`);
    }

    // Step 7: Build transaction with fresh gas (Fix #5)
    const feeData = await provider.getFeeData();
    
    const txParams: any = {
      to: quote.transaction.to as `0x${string}`,
      data: quote.transaction.data as `0x${string}`,
      value: 0n, // After wrapping, we're spending WBNB tokens, not native BNB
      chain: bsc,
    };

    // Use EIP-1559 gas if available, otherwise legacy (Fix #5)
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      txParams.maxFeePerGas = feeData.maxFeePerGas;
      txParams.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      console.log(`Using EIP-1559 gas: maxFee=${ethers.formatUnits(feeData.maxFeePerGas, 'gwei')} gwei`);
    } else if (feeData.gasPrice) {
      const bufferedGasPrice = feeData.gasPrice * 110n / 100n; // 10% buffer
      txParams.gasPrice = bufferedGasPrice;
      console.log(`Using legacy gas: ${ethers.formatUnits(bufferedGasPrice, 'gwei')} gwei`);
    }

    // Add gas limit with 20% buffer
    if (quote.transaction.gas) {
      const gasLimit = BigInt(quote.transaction.gas);
      const bufferedGasLimit = gasLimit * 120n / 100n;
      txParams.gas = bufferedGasLimit;
      console.log(`Gas limit: ${bufferedGasLimit.toString()} (includes 20% buffer)`);
    }

    // Step 8: Simulate transaction before execution (Fix #6)
    console.log('Simulating transaction...');
    try {
      await publicClient.call({
        to: txParams.to,
        data: txParams.data,
        value: txParams.value,
        account: walletAddress as `0x${string}`,
      });
      console.log('Simulation passed');
    } catch (simError: any) {
      console.error('Simulation failed:', simError);
      
      let revertReason = 'Unknown reason';
      if (simError.cause?.reason) {
        revertReason = simError.cause.reason;
      } else if (simError.shortMessage) {
        revertReason = simError.shortMessage;
      } else if (simError.message) {
        revertReason = simError.message;
      }
      
      return {
        success: false,
        error: `Transaction would fail: ${revertReason}`,
      };
    }

    // Step 9: Execute immediately (no delays after quote)
    console.log('Executing 0x swap transaction...');
    const transactionHash = await walletClient.sendTransaction(txParams);

    console.log('0x swap transaction sent:', transactionHash);

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    console.log('0x swap transaction confirmed:', receipt.transactionHash);
    console.log('Transaction receipt status:', receipt.status);

    // Check transaction status and decode revert reason if needed (Fix #6)
    if (receipt.status === 'reverted') {
      console.error('Transaction reverted on-chain');
      
      let revertReason = 'Unknown revert reason';
      try {
        // Re-simulate to get the error
        await publicClient.call({
          to: txParams.to,
          data: txParams.data,
          value: txParams.value,
          account: walletAddress as `0x${string}`,
          blockNumber: receipt.blockNumber,
        });
      } catch (replayError: any) {
        if (replayError.cause?.reason) {
          revertReason = replayError.cause.reason;
        } else if (replayError.shortMessage) {
          revertReason = replayError.shortMessage;
        }
      }
      
      return {
        success: false,
        error: `Transaction reverted: ${revertReason}. Check BSCScan: https://bscscan.com/tx/${receipt.transactionHash}`,
        transactionHash: receipt.transactionHash,
      };
    }

    if (receipt.status !== 'success') {
      return {
        success: false,
        error: `Transaction status: ${receipt.status}. Check BSCScan: https://bscscan.com/tx/${receipt.transactionHash}`,
        transactionHash: receipt.transactionHash,
      };
    }

    return {
      success: true,
      transactionHash: receipt.transactionHash,
      amountOut,
    };
  } catch (error) {
    console.error('Error executing 0x swap:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error executing 0x swap',
    };
  }
}
