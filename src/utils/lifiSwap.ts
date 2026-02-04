import { ethers } from 'ethers';
import { createConfig, getRoutes, executeRoute, EVM, ChainId, config } from '@lifi/sdk';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { decryptPrivateKey } from './index';

// Initialize LiFi SDK configuration
const INTEGRATOR = process.env.LIFI_INTEGRATOR || 'stable-uni';
createConfig({ integrator: INTEGRATOR });

// WBNB address on BSC
const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

/**
 * Retry helper with exponential backoff for LiFi API calls
 */
async function retryLiFiCall<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Check if it's a retryable error (network timeout, connection error)
    const isRetryableError = 
      error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      error.code === 'UND_ERR_SOCKET' ||
      error.name === 'ConnectTimeoutError' ||
      error.message?.includes('fetch failed') ||
      error.message?.includes('timeout') ||
      error.message?.includes('ECONNRESET') ||
      error.message?.includes('ENOTFOUND');
    
    if (retries > 0 && isRetryableError) {
      console.warn(`LiFi API call failed (${error.message || error.code}), retrying in ${delayMs}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return retryLiFiCall(fn, retries - 1, delayMs * 2); // Exponential backoff
    }
    throw error;
  }
}

// Standard ERC20 ABI (for token transfers and approvals)
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOutMin: string;
  walletAddress: string;
  encryptedPrivateKey: string;
  slippageTolerance: number;
  deadline: number;
  feeRecipientAddress?: string;
  feeAmount?: string; // Fee amount to deduct and transfer
}

interface SwapResult {
  success: boolean;
  transactionHash?: string;
  amountOut?: string;
  error?: string;
}

/**
 * Get BSC provider (mainnet or testnet)
 */
function getBSCProvider() {
  const rpcUrl = process.env.BSC_RPC_URL || '';
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Get wallet signer from encrypted private key
 */
function getWalletSigner(encryptedPrivateKey: string, walletAddress: string): ethers.Wallet {
  const encryptionPassword = process.env.WALLET_ENCRYPTION_PASSWORD || 'default-encryption-key';
  const privateKey = decryptPrivateKey(encryptedPrivateKey, encryptionPassword);
  const provider = getBSCProvider();
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Get token decimals
 */
async function getTokenDecimals(tokenAddress: string, provider: ethers.Provider): Promise<number> {
  try {
    // Handle native BNB
    if (tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' || 
        tokenAddress.toLowerCase() === ethers.ZeroAddress ||
        tokenAddress.toLowerCase() === WBNB_ADDRESS.toLowerCase()) {
      return 18;
    }

    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const decimals = await tokenContract.decimals();
    return Number(decimals);
  } catch (error) {
    console.error('Error getting token decimals, defaulting to 18:', error);
    return 18; // Default to 18 decimals
  }
}

/**
 * Convert amount to wei/smallest unit based on token decimals
 */
function parseTokenAmount(amount: string, decimals: number): bigint {
  try {
    return ethers.parseUnits(amount, decimals);
  } catch (error) {
    throw new Error(`Invalid amount format: ${amount}`);
  }
}

/**
 * Check if wallet has sufficient BNB for gas fees
 */
async function checkGasBalance(
  signer: ethers.Wallet,
  estimatedGasCost?: bigint
): Promise<{ sufficient: boolean; balance: string; required: string; error?: string }> {
  try {
    const balance = await signer.provider.getBalance(signer.address);
    const balanceBN = ethers.formatEther(balance);
    
    // Get minimum gas requirement from env or use reasonable default (0.001 BNB for BSC)
    const defaultMinGas = process.env.MIN_GAS_RESERVE_BNB 
      ? ethers.parseEther(process.env.MIN_GAS_RESERVE_BNB)
      : ethers.parseEther('0.001');
    
    const minGasRequired = estimatedGasCost || defaultMinGas;
    const minGasRequiredBN = ethers.formatEther(minGasRequired);
    
    const sufficient = balance >= minGasRequired;
    
    return {
      sufficient,
      balance: balanceBN,
      required: minGasRequiredBN,
      error: sufficient ? undefined : `Insufficient BNB for gas fees. Balance: ${balanceBN} BNB, Required: ${minGasRequiredBN} BNB`,
    };
  } catch (error) {
    return {
      sufficient: false,
      balance: '0',
      required: '0',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Transfer service fee to fee recipient
 */
async function transferServiceFee(
  tokenAddress: string,
  feeAmount: string,
  feeRecipientAddress: string,
  signer: ethers.Wallet,
  provider: ethers.Provider
): Promise<void> {
  try {
    const isBNB = tokenAddress.toLowerCase() === WBNB_ADDRESS.toLowerCase() || 
                  tokenAddress.toLowerCase() === ethers.ZeroAddress ||
                  tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

    if (isBNB) {
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
      const tokenDecimals = await getTokenDecimals(tokenAddress, provider);
      const feeAmountWei = parseTokenAmount(feeAmount, tokenDecimals);
      
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      const tx = await tokenContract.transfer(feeRecipientAddress, feeAmountWei);
      await tx.wait();
      console.log(`Service fee transferred: ${feeAmount} tokens to ${feeRecipientAddress}`);
    }
  } catch (error) {
    console.error('Error transferring service fee:', error);
    throw new Error(`Service fee transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get estimated output amount for a swap using LiFi
 */
export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  walletAddress: string
): Promise<{ amountOut: string; path: string[] }> {
  try {
    const provider = getBSCProvider();
    
    // Validate wallet address
    if (!walletAddress || walletAddress === ethers.ZeroAddress) {
      throw new Error('Valid wallet address is required for LiFi quote');
    }
    
    // Determine if tokens are BNB
    const isTokenInBNB = tokenIn.toLowerCase() === WBNB_ADDRESS.toLowerCase() || 
                        tokenIn.toLowerCase() === ethers.ZeroAddress ||
                        tokenIn.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const isTokenOutBNB = tokenOut.toLowerCase() === WBNB_ADDRESS.toLowerCase() || 
                          tokenOut.toLowerCase() === ethers.ZeroAddress ||
                          tokenOut.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

    // LiFi uses WBNB for native BNB
    const lifiTokenIn = isTokenInBNB ? WBNB_ADDRESS : tokenIn;
    const lifiTokenOut = isTokenOutBNB ? WBNB_ADDRESS : tokenOut;

    // Get token decimals
    const tokenInDecimals = isTokenInBNB ? 18 : await getTokenDecimals(tokenIn, provider);
    const amountInWei = parseTokenAmount(amountIn, tokenInDecimals);
    const amountInBigInt = BigInt(amountInWei.toString());

    // Log the request details for debugging
    console.log('LiFi quote request:', {
      fromChainId: ChainId.BSC,
      fromTokenAddress: lifiTokenIn,
      fromAmount: amountInBigInt.toString(),
      fromAddress: walletAddress,
      toChainId: ChainId.BSC,
      toTokenAddress: lifiTokenOut,
      originalAmountIn: amountIn,
      tokenInDecimals,
    });

    // Get routes from LiFi - requires valid wallet address
    // Wrap in retry logic to handle network timeouts
    const routesResponse = await retryLiFiCall(() => getRoutes({
      fromChainId: ChainId.BSC,
      fromTokenAddress: lifiTokenIn,
      fromAmount: amountInBigInt.toString(),
      fromAddress: walletAddress, // LiFi requires a valid wallet address
      toChainId: ChainId.BSC, // BSC only
      toTokenAddress: lifiTokenOut,
      options: {
        order: 'RECOMMENDED',
      },
    }));

    console.log('LiFi routes response:', {
      hasRoutes: !!routesResponse?.routes,
      routesCount: routesResponse?.routes?.length || 0,
    });

    if (!routesResponse || !routesResponse.routes || routesResponse.routes.length === 0) {
      // Provide a more helpful error message
      const errorMessage = routesResponse?.routes && routesResponse.routes.length === 0
        ? `No swap routes available for this token pair. The token pair ${lifiTokenIn} -> ${lifiTokenOut} may not have sufficient liquidity on any DEX that LiFi aggregates, or the tokens may not be tradeable on BSC.`
        : `No routes found for this swap. Token pair: ${lifiTokenIn} -> ${lifiTokenOut}. The pool may not have sufficient liquidity on BSC.`;
      
      throw new Error(errorMessage);
    }

    // Get the best route (first route is usually the best)
    const bestRoute = routesResponse.routes[0];
    
    // Log route details for debugging
    const routeToAmount = (bestRoute as any).toAmount;
    console.log('Best route details:', {
      stepsCount: bestRoute.steps?.length || 0,
      tags: (bestRoute as any).tags,
      toAmount: routeToAmount,
      toAmountString: routeToAmount ? routeToAmount.toString() : 'undefined',
    });

    if (!bestRoute.steps || bestRoute.steps.length === 0) {
      throw new Error('Route has no steps. Cannot execute swap.');
    }

    const lastStep = bestRoute.steps[bestRoute.steps.length - 1];
    const lastAction = lastStep.action;
    
    // Log action details for debugging
    console.log('Last action details:', {
      type: (lastAction as any).type || 'unknown',
      toAmount: (lastAction as any).toAmount,
      estimate: (lastAction as any).estimate ? {
        toAmount: (lastAction as any).estimate.toAmount,
      } : 'no estimate',
    });
    
    // Try to get toAmount from different possible locations (check route first since logs show it's there)
    let amountOutWei: bigint;
    if ((bestRoute as any).toAmount) {
      amountOutWei = BigInt((bestRoute as any).toAmount);
    } else if ((lastAction as any).toAmount) {
      amountOutWei = BigInt((lastAction as any).toAmount);
    } else if ((lastAction as any).estimate?.toAmount) {
      amountOutWei = BigInt((lastAction as any).estimate.toAmount);
    } else {
      console.error('Route structure - lastAction:', JSON.stringify(lastAction, null, 2));
      console.error('Route structure - bestRoute (first 500 chars):', JSON.stringify(bestRoute, null, 2).substring(0, 500));
      throw new Error('Could not find output amount in route. Route structure may have changed.');
    }

    console.log('Extracted amountOutWei:', amountOutWei.toString());

    if (amountOutWei === BigInt(0)) {
      // For very small amounts, the output might be 0 due to rounding or minimum swap requirements
      const amountInNum = parseFloat(amountIn);
      if (amountInNum < 2) {
        throw new Error(`Swap amount too small. Minimum recommended amount is 2 ${tokenIn === WBNB_ADDRESS ? 'BNB' : 'tokens'}. The output amount would be too small to execute.`);
      }
      throw new Error(`No liquidity available for this swap path. Token pair: ${lifiTokenIn} -> ${lifiTokenOut}. The pool may not exist or have zero liquidity.`);
    }

    // Get token decimals for output
    const tokenOutDecimals = isTokenOutBNB ? 18 : await getTokenDecimals(tokenOut, provider);
    const amountOut = ethers.formatUnits(amountOutWei.toString(), tokenOutDecimals);

    // Build path from route steps
    const path: string[] = [];
    if (bestRoute.steps && bestRoute.steps.length > 0) {
      for (const step of bestRoute.steps) {
        if (step.action.fromToken.address) {
          path.push(step.action.fromToken.address);
        }
        if (step.action.toToken.address && !path.includes(step.action.toToken.address)) {
          path.push(step.action.toToken.address);
        }
      }
    }

    // Fallback: use token addresses if path is empty
    if (path.length === 0) {
      path.push(lifiTokenIn);
      if (lifiTokenIn !== lifiTokenOut) {
        path.push(lifiTokenOut);
      }
    }

    console.log(`LiFi quote: ${amountIn} ${lifiTokenIn} -> ${amountOut} ${lifiTokenOut}`);

    return {
      amountOut,
      path,
    };
  } catch (error) {
    console.error('Error getting LiFi quote:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to get swap quote: ${error.message}`);
    }
    throw new Error('Failed to get swap quote: Unknown error');
  }
}

/**
 * Execute swap on BSC using LiFi
 * 
 * Fee Structure:
 * 1. Gas fees: Always paid in BNB (native token) - required for all transactions
 * 2. Service fees: Paid in the input token (e.g., MARS when swapping MARS->USDT)
 * 3. DEX fees: Built into LiFi swap (automatically deducted by the DEX)
 */
export async function executeBSCSwap(params: SwapParams): Promise<SwapResult> {
  try {
    const {
      tokenIn,
      tokenOut,
      amountIn,
      amountOutMin,
      walletAddress,
      encryptedPrivateKey,
      slippageTolerance,
      deadline,
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

    // Determine if tokens are BNB
    const isTokenInBNB = tokenIn.toLowerCase() === WBNB_ADDRESS.toLowerCase() || 
                        tokenIn.toLowerCase() === ethers.ZeroAddress ||
                        tokenIn.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const isTokenOutBNB = tokenOut.toLowerCase() === WBNB_ADDRESS.toLowerCase() || 
                         tokenOut.toLowerCase() === ethers.ZeroAddress ||
                         tokenOut.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

    // LiFi uses WBNB for native BNB
    const lifiTokenIn = isTokenInBNB ? WBNB_ADDRESS : tokenIn;
    const lifiTokenOut = isTokenOutBNB ? WBNB_ADDRESS : tokenOut;

    // Get quote first to validate the swap
    console.log('Getting LiFi quote...');
    let quoteAmountOut: string;
    try {
      const quote = await getSwapQuote(tokenIn, tokenOut, amountIn, walletAddress);
      quoteAmountOut = quote.amountOut;
      console.log(`LiFi quote: ${amountIn} -> ${quoteAmountOut}`);
    } catch (quoteError) {
      const errorMessage = quoteError instanceof Error ? quoteError.message : 'Failed to get swap quote';
      // If no routes are available, provide a clear error
      if (errorMessage.includes('No swap routes available') || errorMessage.includes('No routes found')) {
        return {
          success: false,
          error: errorMessage + ' This token pair may not have sufficient liquidity on any DEX that LiFi aggregates.',
        };
      }
      return {
        success: false,
        error: errorMessage,
      };
    }

    // --- Fee Handling ---
    // There are three types of fees:
    // 1. Gas fees: Always paid in BNB by the user's wallet for transaction execution.
    // 2. Service fees (custom platform fee): Deducted from the `tokenIn` amount and transferred to `feeRecipientAddress`.
    // 3. DEX swap fees (e.g., PancakeSwap's 0.25%): Automatically deducted by the DEX from the swap amount.

    // Calculate actual swap amount (amountIn - feeAmount) if service fee is specified
    let actualSwapAmount = amountIn;
    let feeAmountWei: bigint | undefined;

    if (feeAmount && feeRecipientAddress && parseFloat(feeAmount) > 0) {
      const feeAmountNum = parseFloat(feeAmount);
      const amountInNum = parseFloat(amountIn);

      if (feeAmountNum >= amountInNum) {
        return {
          success: false,
          error: 'Service fee amount cannot be greater than or equal to swap amount',
        };
      }

      // Calculate actual swap amount (amountIn - service fee)
      actualSwapAmount = (amountInNum - feeAmountNum).toFixed(18);

      // Convert service fee amount to wei
      if (isTokenInBNB) {
        feeAmountWei = parseTokenAmount(feeAmount, 18);
      } else {
        const tokenInDecimals = await getTokenDecimals(tokenIn, provider);
        feeAmountWei = parseTokenAmount(feeAmount, tokenInDecimals);
      }
    }

    // Get token decimals
    const tokenInDecimals = isTokenInBNB ? 18 : await getTokenDecimals(tokenIn, provider);
    const tokenOutDecimals = isTokenOutBNB ? 18 : await getTokenDecimals(tokenOut, provider);
    const amountInWei = parseTokenAmount(actualSwapAmount, tokenInDecimals);
    const amountInBigInt = BigInt(amountInWei.toString());

    // Re-validate quote right before swap to account for any pool changes
    let finalQuoteAmountOut: string;
    try {
      const reQuote = await getSwapQuote(tokenIn, tokenOut, actualSwapAmount, walletAddress);
      finalQuoteAmountOut = reQuote.amountOut;
      
      // Check if quote changed significantly (more than 5% difference)
      const originalQuoteNum = parseFloat(quoteAmountOut);
      const newQuoteNum = parseFloat(finalQuoteAmountOut);
      const quoteChangePercent = Math.abs((newQuoteNum - originalQuoteNum) / originalQuoteNum) * 100;
      
      if (quoteChangePercent > 5) {
        console.warn(`Quote changed by ${quoteChangePercent.toFixed(2)}% between initial quote and execution. Using new quote.`);
      }
      
      // Use the latest quote
      quoteAmountOut = finalQuoteAmountOut;
    } catch (reQuoteError) {
      console.warn('Could not re-validate quote, using original:', reQuoteError);
      // Continue with original quote
    }

    // Calculate amountOutMin - we'll validate it against the actual route output later
    // Don't validate against the initial quote as prices may move between quote and execution
    let amountOutMinWei: bigint;
    if (amountOutMin && parseFloat(amountOutMin) > 0) {
      amountOutMinWei = parseTokenAmount(amountOutMin, tokenOutDecimals);
    } else {
      // If no amountOutMin provided, use quote with slippage tolerance
      const quoteAmountOutNum = parseFloat(quoteAmountOut);
      const slippageAdjusted = (quoteAmountOutNum * (100 - slippageTolerance) / 100).toFixed(18);
      amountOutMinWei = parseTokenAmount(slippageAdjusted, tokenOutDecimals);
    }
    
    // Additional validation: ensure amountOutMin is not zero
    if (amountOutMinWei === BigInt(0)) {
      return {
        success: false,
        error: 'Calculated minimum output amount is zero. This swap cannot be executed safely.',
      };
    }

    // Transfer service fee before swap if specified
    if (feeAmountWei && feeRecipientAddress) {
      console.log('Transferring service fee...');
      try {
        await transferServiceFee(tokenIn, feeAmount!, feeRecipientAddress, signer, provider);
      } catch (feeError) {
        return {
          success: false,
          error: `Failed to transfer service fee: ${feeError instanceof Error ? feeError.message : 'Unknown error'}`,
        };
      }
    }

    // Get routes from LiFi for execution
    console.log('Getting LiFi routes for execution...');
    // Wrap in retry logic to handle network timeouts
    const routesResponse = await retryLiFiCall(() => getRoutes({
      fromChainId: ChainId.BSC,
      fromTokenAddress: lifiTokenIn,
      fromAmount: amountInBigInt.toString(),
      fromAddress: walletAddress,
      toChainId: ChainId.BSC,
      toTokenAddress: lifiTokenOut,
      options: {
        slippage: slippageTolerance / 100, // Convert percentage to decimal (e.g., 1% = 0.01)
        order: 'RECOMMENDED',
      },
    }));

    if (!routesResponse || !routesResponse.routes || routesResponse.routes.length === 0) {
      return {
        success: false,
        error: 'No routes found for this swap. The token pair may not have sufficient liquidity.',
      };
    }

    // Get the best route
    const bestRoute = routesResponse.routes[0];

    // Get the route's actual output amount
    const lastStep = bestRoute.steps[bestRoute.steps.length - 1];
    const lastAction = lastStep.action;
    
    // Try to get the route's output amount from different possible locations
    let routeOutputAmount: bigint;
    if ((bestRoute as any).toAmount) {
      routeOutputAmount = BigInt((bestRoute as any).toAmount);
    } else if ((lastAction as any).toAmount) {
      routeOutputAmount = BigInt((lastAction as any).toAmount);
    } else if ((lastAction as any).estimate?.toAmount) {
      routeOutputAmount = BigInt((lastAction as any).estimate.toAmount);
    } else {
      return {
        success: false,
        error: 'Could not determine route output amount. Cannot validate swap.',
      };
    }
    
    // Get the route's minimum output (with slippage already applied by LiFi)
    const routeMinAmountOut = BigInt((lastAction as any).toAmountMin || '0');
    
    // Always use the route's minimum output if available, as it's already adjusted for slippage
    // and reflects the current market conditions. Only fall back to our calculated minimum
    // if the route doesn't provide one.
    let finalAmountOutMin: bigint;
    
    if (routeMinAmountOut > BigInt(0)) {
      // Use route's minimum (already has slippage applied by LiFi)
      finalAmountOutMin = routeMinAmountOut;
      
      // Safety check: if route's minimum is higher than route's output (can happen due to price movement),
      // adjust it to be slightly below route output to allow execution
      if (finalAmountOutMin > routeOutputAmount) {
        const routeOutputFormatted = ethers.formatUnits(routeOutputAmount, tokenOutDecimals);
        const routeMinFormatted = ethers.formatUnits(finalAmountOutMin, tokenOutDecimals);
        // Adjust to 0.1% below route output (allows execution while still being close to expected)
        finalAmountOutMin = routeOutputAmount - (routeOutputAmount * BigInt(1) / BigInt(1000));
        console.warn(`Route's minimum (${routeMinFormatted}) is higher than route output (${routeOutputFormatted}). ` +
                    `Adjusting to ${ethers.formatUnits(finalAmountOutMin, tokenOutDecimals)} to allow execution. ` +
                    `Price may have moved since route was calculated.`);
      } else {
        console.log(`Using route's minimum output: ${ethers.formatUnits(finalAmountOutMin, tokenOutDecimals)} ` +
                    `(Route output: ${ethers.formatUnits(routeOutputAmount, tokenOutDecimals)}, ` +
                    `Our calculated minimum: ${ethers.formatUnits(amountOutMinWei, tokenOutDecimals)})`);
      }
    } else {
      // Fallback: use our calculated minimum, but ensure it's not higher than route output
      if (amountOutMinWei > routeOutputAmount) {
        const routeOutputFormatted = ethers.formatUnits(routeOutputAmount, tokenOutDecimals);
        const amountOutMinFormatted = ethers.formatUnits(amountOutMinWei, tokenOutDecimals);
        // Adjust our minimum to be slightly below route output to allow execution
        finalAmountOutMin = routeOutputAmount - (routeOutputAmount * BigInt(1) / BigInt(1000)); // 0.1% below
        console.warn(`Our minimum (${amountOutMinFormatted}) is higher than route output (${routeOutputFormatted}). ` +
                    `Adjusting to ${ethers.formatUnits(finalAmountOutMin, tokenOutDecimals)} to allow execution.`);
      } else {
        finalAmountOutMin = amountOutMinWei;
      }
    }
    
    // Update amountOutMinWei to use the final value
    amountOutMinWei = finalAmountOutMin;

    // Create viem wallet client from private key
    const encryptionPassword = process.env.WALLET_ENCRYPTION_PASSWORD || 'default-encryption-key';
    const privateKey = decryptPrivateKey(encryptedPrivateKey, encryptionPassword);
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    
    const rpcUrl = process.env.BSC_RPC_URL || '';
    const walletClient = createWalletClient({
      account,
      chain: bsc,
      transport: http(rpcUrl),
    });

    // Create EVM provider for LiFi with wallet client
    // Note: The EVM provider must be registered with the SDK using setProviders
    // Type assertion needed due to viem Client type compatibility with LiFi SDK
    const evmProvider = EVM({
      getWalletClient: async () => walletClient as any,
    } as any);
    
    // Register the provider with the SDK
    config.setProviders([evmProvider]);

    // Execute the route using LiFi
    console.log('Executing LiFi swap...');
    console.log('Route details:', {
      routeId: bestRoute.id,
      stepsCount: bestRoute.steps?.length || 0,
      fromToken: bestRoute.fromToken?.symbol,
      toToken: bestRoute.toToken?.symbol,
      fromAmount: bestRoute.fromAmount,
      toAmount: bestRoute.toAmount,
    });
    
    const executionStartTime = Date.now();
    try {
      const result = await executeRoute(bestRoute, {
        // The provider is now registered and will be used automatically
        // executeInBackground: false, // Execute synchronously to get immediate result
      });
      
      const executionTime = Date.now() - executionStartTime;
      console.log(`LiFi route execution completed in ${executionTime}ms`);

      // Extract transaction hash from the executed route
      let transactionHash: string | undefined;
      if (result.steps && result.steps.length > 0) {
        const lastExecutedStep = result.steps[result.steps.length - 1];
        if (lastExecutedStep.execution?.process) {
          const swapProcess = lastExecutedStep.execution.process.find(
            (p) => p.type === 'SWAP' && p.txHash
          );
          if (swapProcess?.txHash) {
            transactionHash = swapProcess.txHash;
          }
        }
      }

      if (!transactionHash) {
        return {
          success: false,
          error: 'Swap execution completed but no transaction hash was returned.',
        };
      }

      // Get the actual amount out from the transaction receipt
      let actualAmountOut = quoteAmountOut;
      try {
        const receipt = await provider.getTransactionReceipt(transactionHash);
        if (receipt) {
          // Try to extract amount out from logs if possible
          // For now, use the quote amount as it should be accurate
          console.log('Swap transaction confirmed:', transactionHash);
        }
      } catch (receiptError) {
        console.warn('Could not fetch transaction receipt:', receiptError);
      }

      return {
        success: true,
        transactionHash,
        amountOut: actualAmountOut,
      };
    } catch (execError) {
      console.error('Error executing LiFi route:', execError);
      if (execError instanceof Error) {
        if (execError.message.includes('user rejected') || execError.message.includes('denied')) {
          return {
            success: false,
            error: 'Swap was rejected or cancelled by user.',
          };
        }
        if (execError.message.includes('insufficient') || execError.message.includes('INSUFFICIENT')) {
          return {
            success: false,
            error: `Insufficient liquidity or balance. ${execError.message}`,
          };
        }
        return {
          success: false,
          error: `Swap execution failed: ${execError.message}`,
        };
      }
      return {
        success: false,
        error: 'Swap execution failed: Unknown error',
      };
    }
  } catch (error) {
    console.error('Error executing BSC swap with LiFi:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
