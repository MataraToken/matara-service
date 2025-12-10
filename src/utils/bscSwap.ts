import { ethers } from 'ethers';
import { decryptPrivateKey } from './index';

// PancakeSwap Router V2 address on BSC Mainnet
const PANCAKESWAP_ROUTER_V2 = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
// WBNB address on BSC
const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

// Standard ERC20 ABI (for token transfers and approvals)
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// PancakeSwap Router V2 ABI
const PANCAKESWAP_ROUTER_ABI = [
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapTokensForExactETH(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts)',
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
 * Check and approve token spending if needed
 */
async function ensureTokenApproval(
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
  signer: ethers.Wallet
): Promise<boolean> {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const currentAllowance = await tokenContract.allowance(signer.address, spenderAddress);
    
    if (currentAllowance >= amount) {
      return true; // Already approved
    }

    // Approve maximum amount for efficiency (or specific amount)
    // In ethers v6, use the constant or calculate: 2^256 - 1
    const maxApproval = typeof ethers.MaxUint256 !== 'undefined' 
      ? ethers.MaxUint256 
      : BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    const approveTx = await tokenContract.approve(spenderAddress, maxApproval);
    await approveTx.wait();
    
    return true;
  } catch (error) {
    console.error('Error approving token:', error);
    throw new Error(`Token approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get token decimals
 */
async function getTokenDecimals(tokenAddress: string, provider: ethers.Provider): Promise<number> {
  try {
    // Handle native BNB
    if (tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' || 
        tokenAddress.toLowerCase() === ethers.ZeroAddress) {
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
    // BSC gas fees are typically much lower than Ethereum
    const defaultMinGas = process.env.MIN_GAS_RESERVE_BNB 
      ? ethers.parseEther(process.env.MIN_GAS_RESERVE_BNB)
      : ethers.parseEther('0.001'); // 0.001 BNB is more reasonable for BSC
    
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
      error: `Error checking gas balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Estimate gas cost for swap transaction
 */
async function estimateSwapGas(
  router: ethers.Contract,
  swapFunction: string,
  params: any[],
  signer: ethers.Wallet
): Promise<bigint> {
  try {
    // Estimate gas for the swap transaction
    const gasEstimate = await router[swapFunction].estimateGas(...params);
    
    // Get current gas price
    const feeData = await signer.provider.getFeeData();
    const gasPrice = feeData.gasPrice || BigInt(0);
    
    // Calculate total gas cost (gas limit * gas price)
    // Add 20% buffer for safety
    const gasCost = (gasEstimate * gasPrice * BigInt(120)) / BigInt(100);
    
    return gasCost;
  } catch (error) {
    console.warn('Could not estimate gas, using default:', error);
    // Return a conservative estimate (0.001 BNB for BSC) if estimation fails
    const defaultGasReserve = process.env.MIN_GAS_RESERVE_BNB 
      ? ethers.parseEther(process.env.MIN_GAS_RESERVE_BNB)
      : ethers.parseEther('0.001');
    return defaultGasReserve;
  }
}

/**
 * Execute swap on PancakeSwap
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

    // Determine if input is BNB
    const isTokenInBNB = tokenIn.toLowerCase() === WBNB_ADDRESS.toLowerCase() || 
                         tokenIn.toLowerCase() === ethers.ZeroAddress.toLowerCase() ||
                         tokenIn.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    
    // Calculate actual swap amount (amountIn - feeAmount) if fee is specified
    let actualSwapAmount = amountIn;
    let feeAmountWei: bigint | undefined;
    
    if (feeAmount && feeRecipientAddress && parseFloat(feeAmount) > 0) {
      const feeAmountNum = parseFloat(feeAmount);
      const amountInNum = parseFloat(amountIn);
      
      if (feeAmountNum >= amountInNum) {
        return {
          success: false,
          error: 'Fee amount cannot be greater than or equal to swap amount',
        };
      }
      
      // Calculate actual swap amount (amountIn - fee)
      actualSwapAmount = (amountInNum - feeAmountNum).toFixed(18);
      
      // Convert fee amount to wei
      if (isTokenInBNB) {
        feeAmountWei = parseTokenAmount(feeAmount, 18);
      } else {
        const tokenInDecimals = await getTokenDecimals(tokenIn, provider);
        feeAmountWei = parseTokenAmount(feeAmount, tokenInDecimals);
      }
    }

    // Check token balance if swapping tokens (not BNB)
    if (!isTokenInBNB) {
      try {
        const tokenInDecimals = await getTokenDecimals(tokenIn, provider);
        const amountInWei = parseTokenAmount(amountIn, tokenInDecimals); // Check full amount including fee
        
        const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, provider);
        const balance = await tokenContract.balanceOf(walletAddress);
        
        if (balance < amountInWei) {
          const balanceFormatted = ethers.formatUnits(balance, tokenInDecimals);
          return {
            success: false,
            error: `Insufficient token balance. Balance: ${balanceFormatted}, Required: ${amountIn}`,
          };
        }
      } catch (balanceError) {
        console.warn('Could not check token balance:', balanceError);
        // Continue anyway - the transaction will fail on-chain if insufficient
      }
    } else {
      // If swapping BNB, check BNB balance (excluding gas)
      try {
        const balance = await provider.getBalance(walletAddress);
        const tokenInDecimals = 18;
        const amountInWei = parseTokenAmount(amountIn, tokenInDecimals); // Check full amount including fee
        
        // Reserve some BNB for gas (configurable, default 0.001 BNB for BSC)
        const gasReserve = process.env.MIN_GAS_RESERVE_BNB 
          ? ethers.parseEther(process.env.MIN_GAS_RESERVE_BNB)
          : ethers.parseEther('0.0001');
        const availableBalance = balance > gasReserve ? balance - gasReserve : BigInt(0);
        
        if (availableBalance < amountInWei) {
          const balanceFormatted = ethers.formatEther(balance);
          const requiredFormatted = ethers.formatEther(amountInWei + gasReserve);
          return {
            success: false,
            error: `Insufficient BNB balance. Available: ${balanceFormatted} BNB (after gas reserve), Required: ${requiredFormatted} BNB`,
          };
        }
      } catch (balanceError) {
        console.warn('Could not check BNB balance:', balanceError);
      }
    }

    // Transfer fee to recipient if specified
    if (feeAmountWei && feeRecipientAddress && feeRecipientAddress.trim() !== '') {
      // Validate fee recipient address
      if (!ethers.isAddress(feeRecipientAddress)) {
        return {
          success: false,
          error: `Invalid fee recipient address: ${feeRecipientAddress}`,
        };
      }

      // Ensure fee recipient is not the same as wallet address (to avoid unnecessary transfers)
      if (feeRecipientAddress.toLowerCase() === walletAddress.toLowerCase()) {
        console.warn('Fee recipient address is the same as wallet address, skipping fee transfer');
      } else {
        try {
          if (isTokenInBNB) {
            // Transfer BNB fee
            // Check if we have enough BNB for fee + gas
            const balance = await provider.getBalance(walletAddress);
            const gasReserve = process.env.MIN_GAS_RESERVE_BNB 
              ? ethers.parseEther(process.env.MIN_GAS_RESERVE_BNB)
              : ethers.parseEther('0.001');
            if (balance < feeAmountWei + gasReserve) {
              return {
                success: false,
                error: `Insufficient BNB for fee transfer. Required: ${ethers.formatEther(feeAmountWei + gasReserve)} BNB`,
              };
            }

            const feeTx = await signer.sendTransaction({
              to: feeRecipientAddress,
              value: feeAmountWei,
            });
            const feeReceipt = await feeTx.wait();
            console.log(`Fee of ${ethers.formatEther(feeAmountWei)} BNB transferred to ${feeRecipientAddress} in tx ${feeReceipt.hash}`);
          } else {
            // Transfer token fee
            const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, signer);
            
            // Check token balance for fee
            const balance = await tokenContract.balanceOf(walletAddress);
            if (balance < feeAmountWei) {
              return {
                success: false,
                error: `Insufficient token balance for fee transfer`,
              };
            }

            // Transfer fee directly (we own the tokens, no approval needed)
            const feeTx = await tokenContract.transfer(feeRecipientAddress, feeAmountWei);
            const feeReceipt = await feeTx.wait();
            const tokenDecimals = await getTokenDecimals(tokenIn, provider);
            console.log(`Fee of ${ethers.formatUnits(feeAmountWei, tokenDecimals)} ${tokenIn} transferred to ${feeRecipientAddress} in tx ${feeReceipt.hash}`);
          }
        } catch (feeError) {
          console.error('Error transferring fee:', feeError);
          return {
            success: false,
            error: `Failed to transfer fee: ${feeError instanceof Error ? feeError.message : 'Unknown error'}`,
          };
        }
      }
    }

    const router = new ethers.Contract(PANCAKESWAP_ROUTER_V2, PANCAKESWAP_ROUTER_ABI, signer);

    // Determine if output is BNB (input already checked above)
    const isTokenOutBNB = tokenOut.toLowerCase() === WBNB_ADDRESS.toLowerCase() || 
                          tokenOut.toLowerCase() === ethers.ZeroAddress.toLowerCase() ||
                          tokenOut.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

    // Build swap path for PancakeSwap Router V2
    // PancakeSwap uses WBNB as the base pair for routing
    const path: string[] = [];
    
    // Start with input token (or WBNB if input is BNB)
    if (isTokenInBNB) {
      path.push(WBNB_ADDRESS);
    } else {
      path.push(tokenIn);
    }
    
    // Add intermediate token if needed (WBNB for token-to-token swaps)
    if (!isTokenInBNB && !isTokenOutBNB) {
      // Token to token swap - use WBNB as intermediate
      path.push(WBNB_ADDRESS);
    }
    
    // End with output token (or WBNB if output is BNB)
    if (isTokenOutBNB) {
      if (!isTokenInBNB) {
        // Only add WBNB if it's not already in the path
        path.push(WBNB_ADDRESS);
      }
    } else {
      path.push(tokenOut);
    }

    // Get token decimals
    const tokenInDecimals = isTokenInBNB ? 18 : await getTokenDecimals(tokenIn, provider);
    const tokenOutDecimals = isTokenOutBNB ? 18 : await getTokenDecimals(tokenOut, provider);
    const amountInWei = parseTokenAmount(actualSwapAmount, tokenInDecimals); // Use actual swap amount (after fee deduction)
    
    // Recalculate amountOutMin based on actual swap amount if fee was deducted
    // This ensures the minimum output matches what we'll actually get
    let amountOutMinWei: bigint;
    if (amountOutMin && parseFloat(amountOutMin) > 0) {
      // If amountOutMin was provided, we need to adjust it proportionally
      // since the actual swap amount is less than the original amountIn
      if (actualSwapAmount !== amountIn && parseFloat(amountIn) > 0) {
        // Calculate the ratio of actual swap amount to original amount
        const swapRatio = parseFloat(actualSwapAmount) / parseFloat(amountIn);
        // Adjust amountOutMin proportionally
        const adjustedAmountOutMin = (parseFloat(amountOutMin) * swapRatio).toFixed(18);
        amountOutMinWei = parseTokenAmount(adjustedAmountOutMin, tokenOutDecimals);
      } else {
        amountOutMinWei = parseTokenAmount(amountOutMin, tokenOutDecimals);
      }
    } else {
      // If no amountOutMin provided, get a fresh quote for the actual swap amount
      // and apply slippage tolerance
      try {
        const quote = await getSwapQuote(tokenIn, tokenOut, actualSwapAmount);
        const quoteAmountOut = parseFloat(quote.amountOut);
        const slippageAdjusted = (quoteAmountOut * (100 - slippageTolerance) / 100).toFixed(18);
        amountOutMinWei = parseTokenAmount(slippageAdjusted, tokenOutDecimals);
      } catch (quoteError) {
        console.warn('Could not get quote for actual swap amount, using zero minimum:', quoteError);
        amountOutMinWei = BigInt(0);
      }
    }

    // Handle token approval if not BNB
    if (!isTokenInBNB) {
      // Check gas balance before approval (approval also costs gas)
      const approvalGasCheck = await checkGasBalance(signer);
      if (!approvalGasCheck.sufficient) {
        return {
          success: false,
          error: `Insufficient BNB for token approval gas fees. ${approvalGasCheck.error}`,
        };
      }

      const approved = await ensureTokenApproval(tokenIn, PANCAKESWAP_ROUTER_V2, amountInWei, signer);
      if (!approved) {
        throw new Error('Token approval failed');
      }
    }

    // Estimate gas for swap transaction
    let estimatedGasCost: bigint | undefined;
    try {
      // Determine which swap function to use
      const tokenInIsWBNB = tokenIn.toLowerCase() === WBNB_ADDRESS.toLowerCase();
      const tokenOutIsWBNB = tokenOut.toLowerCase() === WBNB_ADDRESS.toLowerCase();
      
      let swapFunction: string;
      let swapParams: any[];
      
      if (tokenInIsWBNB && !tokenOutIsWBNB) {
        swapFunction = 'swapExactTokensForTokens';
        swapParams = [amountInWei, amountOutMinWei, path, walletAddress, deadline];
      } else if (!tokenInIsWBNB && tokenOutIsWBNB) {
        swapFunction = 'swapExactTokensForETH';
        swapParams = [amountInWei, amountOutMinWei, path, walletAddress, deadline];
      } else {
        swapFunction = 'swapExactTokensForTokens';
        swapParams = [amountInWei, amountOutMinWei, path, walletAddress, deadline];
      }
      
      estimatedGasCost = await estimateSwapGas(router, swapFunction, swapParams, signer);
    } catch (gasEstimateError) {
      console.warn('Gas estimation failed, proceeding with balance check only:', gasEstimateError);
    }

    // Final gas balance check with estimated cost
    const finalGasCheck = await checkGasBalance(signer, estimatedGasCost);
    if (!finalGasCheck.sufficient) {
      return {
        success: false,
        error: finalGasCheck.error || 'Insufficient BNB for swap gas fees',
      };
    }

    // Execute swap based on token types
    // Note: PancakeSwap Router uses WBNB internally, so we need to handle WBNB wrapping/unwrapping
    let tx: ethers.ContractTransactionResponse;
    let receipt: ethers.ContractTransactionReceipt | null;

    // Check if we need to wrap/unwrap BNB
    const tokenInIsWBNB = tokenIn.toLowerCase() === WBNB_ADDRESS.toLowerCase();
    const tokenOutIsWBNB = tokenOut.toLowerCase() === WBNB_ADDRESS.toLowerCase();

    if (tokenInIsWBNB && !tokenOutIsWBNB) {
      // Swap WBNB (or native BNB treated as WBNB) for tokens
      // Use swapExactETHForTokens if native BNB, but since we're using WBNB, use swapExactTokensForTokens
      // Actually, if user sends native BNB, we'd need to wrap it first, but for now we assume WBNB
      tx = await router.swapExactTokensForTokens(
        amountInWei,
        amountOutMinWei,
        path,
        walletAddress,
        deadline
      );
    } else if (!tokenInIsWBNB && tokenOutIsWBNB) {
      // Swap tokens for WBNB (or native BNB)
      tx = await router.swapExactTokensForETH(
        amountInWei,
        amountOutMinWei,
        path,
        walletAddress,
        deadline
      );
    } else if (tokenInIsWBNB && tokenOutIsWBNB) {
      // This shouldn't happen, but handle it
      throw new Error('Cannot swap WBNB for WBNB');
    } else {
      // Swap tokens for tokens
      tx = await router.swapExactTokensForTokens(
        amountInWei,
        amountOutMinWei,
        path,
        walletAddress,
        deadline
      );
    }

    // Wait for transaction confirmation
    receipt = await tx.wait();

    if (!receipt) {
      throw new Error('Transaction receipt not found');
    }

    // Extract amount out from transaction logs (if available)
    // For now, we'll return the transaction hash and let the caller query the actual amount
    let actualAmountOut = amountOutMin;

    return {
      success: true,
      transactionHash: receipt.hash,
      amountOut: actualAmountOut,
    };
  } catch (error) {
    console.error('Error executing BSC swap:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Get estimated output amount for a swap (without executing)
 */
export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string
): Promise<{ amountOut: string; path: string[] }> {
  try {
    const provider = getBSCProvider();
    const router = new ethers.Contract(PANCAKESWAP_ROUTER_V2, PANCAKESWAP_ROUTER_ABI, provider);

    // Normalize addresses for comparison
    const tokenInLower = tokenIn.toLowerCase();
    const tokenOutLower = tokenOut.toLowerCase();

    // Check if tokens are the same
    if (tokenInLower === tokenOutLower) {
      throw new Error('Cannot swap the same token');
    }

    const isTokenInBNB = tokenInLower === WBNB_ADDRESS.toLowerCase() || 
                         tokenInLower === ethers.ZeroAddress.toLowerCase() ||
                         tokenInLower === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const isTokenOutBNB = tokenOutLower === WBNB_ADDRESS.toLowerCase() || 
                          tokenOutLower === ethers.ZeroAddress.toLowerCase() ||
                          tokenOutLower === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

    // Build swap path for PancakeSwap Router V2
    // PancakeSwap uses WBNB as the base pair for routing
    const path: string[] = [];
    
    // Start with input token (or WBNB if input is BNB)
    if (isTokenInBNB) {
      path.push(WBNB_ADDRESS);
    } else {
      path.push(tokenIn);
    }
    
    // Add intermediate token if needed (WBNB for token-to-token swaps)
    if (!isTokenInBNB && !isTokenOutBNB) {
      // Token to token swap - use WBNB as intermediate
      path.push(WBNB_ADDRESS);
    }
    
    // End with output token (or WBNB if output is BNB)
    if (isTokenOutBNB) {
      if (!isTokenInBNB) {
        // Only add WBNB if it's not already in the path
        path.push(WBNB_ADDRESS);
      }
    } else {
      path.push(tokenOut);
    }

    // Validate path has at least 2 elements
    if (path.length < 2) {
      throw new Error(`Invalid swap path: path must have at least 2 tokens. Path: ${path.join(' -> ')}`);
    }

    const tokenInDecimals = isTokenInBNB ? 18 : await getTokenDecimals(tokenIn, provider);
    const amountInWei = parseTokenAmount(amountIn, tokenInDecimals);

    const amounts = await router.getAmountsOut(amountInWei, path);
    const amountOutWei = amounts[amounts.length - 1];
    const tokenOutDecimals = isTokenOutBNB ? 18 : await getTokenDecimals(tokenOut, provider);
    const amountOut = ethers.formatUnits(amountOutWei, tokenOutDecimals);

    return {
      amountOut,
      path,
    };
  } catch (error) {
    console.error('Error getting swap quote:', error);
    throw error;
  }
}

