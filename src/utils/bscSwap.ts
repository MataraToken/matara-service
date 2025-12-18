

import { ethers } from 'ethers';
import { decryptPrivateKey } from './index';
import { Token, CurrencyAmount, TradeType, Native, Percent } from '@pancakeswap/sdk';
import { ChainId } from '@pancakeswap/chains';
import { SmartRouter } from '@pancakeswap/smart-router';
import { PancakeSwapUniversalRouter } from '@pancakeswap/universal-router-sdk';
import { createPublicClient, http, Address } from 'viem';
import { bsc } from 'viem/chains';
import { GraphQLClient } from 'graphql-request';

// PancakeSwap Universal Router V4 address on BSC Mainnet
const PANCAKESWAP_ROUTER_V4 = '0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB';
// WBNB address on BSC
const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

// Standard ERC20 ABI
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// PancakeSwap Universal Router V4 ABI - updated
const UNIVERSAL_ROUTER_ABI = [
  'function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable returns (bytes[] memory outputs)',
  'function executeWithAdditionalRecipients(bytes calldata commands, bytes[] calldata inputs, uint256 deadline, address[] calldata additionalRecipients, uint256[] calldata additionalAmounts) external payable returns (bytes[] memory outputs)'
];

// Add these constants for PancakeSwap
const PANCAKESWAP_V2_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
const PANCAKESWAP_V2_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';

// Constants for Universal Router commands
// Note: Command 0 = V2_SWAP_EXACT_IN (bytes path), Command 8 = V3_SWAP_EXACT_IN (address[] path)
// PancakeSwap Universal Router may prefer V3-style swaps with address[] path
const V2_SWAP_EXACT_IN = '0x00';  // V2 swap with bytes path
const V3_SWAP_EXACT_IN = '0x08';  // V3 swap with address[] path (may work better for PancakeSwap)
const WRAP_ETH = '0x0b';          // hex 0x0b
const UNWRAP_WETH = '0x0c';       // hex 0x0c

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
  feeAmount?: string;
}

interface SwapResult {
  success: boolean;
  transactionHash?: string;
  amountOut?: string;
  error?: string;
}

const BSC_CHAIN_ID = ChainId.BSC;

/**
 * Encode swap command for Universal Router - fixed version
 * 
 * Command bytes:
 * - 0x00 = V2_SWAP_EXACT_IN
 * - 0x0b = WRAP_ETH
 * - 0x0c = UNWRAP_WETH
 * 
 * For native BNB swaps: WRAP_ETH (0x0b) + V3_SWAP_EXACT_IN (0x08) = 0x0b08
 * For token swaps: V3_SWAP_EXACT_IN (0x08)
 * For token -> BNB: V3_SWAP_EXACT_IN (0x08) + UNWRAP_WETH (0x0c) = 0x080c
 * 
 * Note: PancakeSwap Universal Router may not support V2_SWAP_EXACT_IN (command 0x00)
 * Using V3_SWAP_EXACT_IN (command 0x08) with address[] path instead
 * V3 pools should have good liquidity for major pairs like WBNB/USDT
 */
function encodeSwapCommand(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  amountOutMin: bigint,
  recipient: string,
  path: string[],
  isTokenInBNB: boolean,
  isTokenOutBNB: boolean
): { commands: string; inputs: string[] } {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const commands: string[] = [];
  const inputs: string[] = [];
  
  // For Universal Router, commands are concatenated bytes
  // NOTE: PancakeSwap Universal Router may not support V2_SWAP_EXACT_IN (command 0x00)
  // Try using V3_SWAP_EXACT_IN (command 0x08) with address[] path instead
  if (isTokenInBNB) {
    // For native BNB -> Token: WRAP_ETH + V3_SWAP_EXACT_IN
    // This wraps native BNB to WBNB, then swaps WBNB -> tokenOut
    commands.push(WRAP_ETH); // 0x0b
    
    // WRAP_ETH input: (address recipient, uint256 amountMin)
    // recipient = MSG_SENDER constant (0x0001) means wrapped WBNB stays with router
    // amountMin = 0 (wrapping is 1:1, no slippage)
    const wrapInput = abiCoder.encode(
      ['address', 'uint256'],
      ['0x0000000000000000000000000000000000000001', BigInt(0)] // MSG_SENDER constant
    );
    inputs.push(wrapInput);
    
    commands.push(V3_SWAP_EXACT_IN); // 0x08 (uses address[] path)
  } else {
    // For Token -> Token or Token -> BNB: V3_SWAP_EXACT_IN
    commands.push(V3_SWAP_EXACT_IN); // 0x08 (uses address[] path)
  }
  
  // V3_SWAP_EXACT_IN uses address[] path (not bytes)
  // Normalize path addresses
  const normalizedPath = path.map(addr => {
    const normalized = addr.toLowerCase();
    return normalized.startsWith('0x') ? normalized : `0x${normalized}`;
  });
  
  // V3_SWAP_EXACT_IN: (address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser)
  // payerIsUser: false means router pays (router has WBNB after wrapping for BNB swaps)
  // payerIsUser: true means user pays (user must have approved tokens for token swaps)
  // 
  // IMPORTANT: For BNB swaps, after WRAP_ETH, the WBNB should be with the router (MSG_SENDER)
  // So payerIsUser should be false. However, if TRANSFER_FAILED occurs, it might mean:
  // 1. The router doesn't have access to the WBNB after wrapping
  // 2. V3 swaps work differently and need payerIsUser=true even for wrapped tokens
  // 3. PancakeSwap Universal Router might not support this command sequence
  const payerIsUser = !isTokenInBNB; // If BNB, router already has WBNB after wrapping
  
  // Debug logging
  console.log(`[encodeSwapCommand] payerIsUser: ${payerIsUser}, isTokenInBNB: ${isTokenInBNB}`);
  
  // If output is BNB, send WBNB to router (MSG_SENDER) so it can unwrap
  // Otherwise, send directly to recipient
  const swapRecipient = isTokenOutBNB ? '0x0000000000000000000000000000000000000001' : recipient;
  
  const swapInput = abiCoder.encode(
    ['address', 'uint256', 'uint256', 'address[]', 'bool'],
    [
      swapRecipient,
      amountIn,
      amountOutMin,
      normalizedPath,
      payerIsUser
    ]
  );
  
  inputs.push(swapInput);
  
  // If output is BNB, add UNWRAP_WETH command
  if (isTokenOutBNB && !isTokenInBNB) {
    commands.push(UNWRAP_WETH); // 0x0c
    
    // UNWRAP_WETH: (address recipient, uint256 amountMin)
    const unwrapInput = abiCoder.encode(
      ['address', 'uint256'],
      [recipient, amountOutMin]
    );
    inputs.push(unwrapInput);
  }
  
  // Convert commands array to bytes string
  let commandsBytes = '0x';
  for (const cmd of commands) {
    commandsBytes += cmd.slice(2); // Remove '0x' prefix
  }
  
  return {
    commands: commandsBytes,
    inputs: inputs
  };
}

/**
 * Get gas estimation for the swap
 */
async function estimateSwapGas(
  router: ethers.Contract,
  commands: string,
  inputs: string[],
  deadline: number,
  value: bigint
): Promise<bigint> {
  try {
    const executeFunction = router.getFunction('execute(bytes,bytes[],uint256)');
    const gasEstimate = await executeFunction.estimateGas(
      commands,
      inputs,
      deadline,
      { value }
    );
    // Add 20% buffer
    return (gasEstimate * BigInt(120)) / BigInt(100);
  } catch (error) {
    console.warn('Gas estimation failed, using default:', error);
    return BigInt(300000); // Default gas limit
  }
}

function getBSCProvider() {
  const rpcUrl = process.env.BSC_RPC_URL || '';
  return new ethers.JsonRpcProvider(rpcUrl);
}

function getWalletSigner(encryptedPrivateKey: string, walletAddress: string): ethers.Wallet {
  const encryptionPassword = process.env.WALLET_ENCRYPTION_PASSWORD || 'default-encryption-key';
  const privateKey = decryptPrivateKey(encryptedPrivateKey, encryptionPassword);
  const provider = getBSCProvider();
  return new ethers.Wallet(privateKey, provider);
}

async function ensureTokenApproval(
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
  signer: ethers.Wallet
): Promise<boolean> {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const currentAllowance = await tokenContract.allowance(signer.address, spenderAddress);
    
    console.log(`Current allowance: ${currentAllowance.toString()}, Required: ${amount.toString()}`);
    
    if (currentAllowance >= amount) {
      console.log('Sufficient allowance already exists');
      return true;
    }

    if (currentAllowance > BigInt(0)) {
      console.log('Resetting allowance to 0 first...');
      const resetTx = await tokenContract.approve(spenderAddress, BigInt(0));
      const resetReceipt = await resetTx.wait();
      console.log(`Allowance reset confirmed: ${resetReceipt.hash}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    const maxApproval = ethers.MaxUint256;
    console.log(`Approving max amount for token ${tokenAddress}`);
    const approveTx = await tokenContract.approve(spenderAddress, maxApproval);
    const receipt = await approveTx.wait();
    console.log(`Approval confirmed: ${receipt.hash}`);
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const newAllowance = await tokenContract.allowance(signer.address, spenderAddress);
    console.log(`New allowance: ${newAllowance.toString()}`);
    
    return newAllowance >= amount;
  } catch (error) {
    console.error('Error approving token:', error);
    throw new Error(`Token approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function getTokenDecimals(tokenAddress: string, provider: ethers.Provider): Promise<number> {
  try {
    if (tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' || 
        tokenAddress.toLowerCase() === ethers.ZeroAddress) {
      return 18;
    }

    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const decimals = await tokenContract.decimals();
    return Number(decimals);
  } catch (error) {
    console.error('Error getting token decimals:', error);
    return 18;
  }
}

function parseTokenAmount(amount: string, decimals: number): bigint {
  try {
    return ethers.parseUnits(amount, decimals);
  } catch (error) {
    throw new Error(`Invalid amount format: ${amount}`);
  }
}

async function checkGasBalance(
  signer: ethers.Wallet,
  estimatedGasCost?: bigint
): Promise<{ sufficient: boolean; balance: string; required: string; error?: string }> {
  try {
    const balance = await signer.provider.getBalance(signer.address);
    const balanceBN = ethers.formatEther(balance);
    
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
      error: sufficient ? undefined : `Insufficient BNB for gas. Balance: ${balanceBN}, Required: ${minGasRequiredBN}`,
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

    if (signer.address.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error('Wallet address mismatch');
    }

    const initialGasCheck = await checkGasBalance(signer);
    if (!initialGasCheck.sufficient) {
      return {
        success: false,
        error: initialGasCheck.error || 'Insufficient BNB for gas fees',
      };
    }

    const isTokenInBNB = tokenIn.toLowerCase() === WBNB_ADDRESS.toLowerCase() || 
                         tokenIn.toLowerCase() === ethers.ZeroAddress.toLowerCase() ||
                         tokenIn.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    
    const isTokenOutBNB = tokenOut.toLowerCase() === WBNB_ADDRESS.toLowerCase() || 
                          tokenOut.toLowerCase() === ethers.ZeroAddress.toLowerCase() ||
                          tokenOut.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    
    // Calculate swap amount after fee
    let actualSwapAmount = amountIn;
    let feeAmountWei: bigint | undefined;
    
    if (feeAmount && feeRecipientAddress && parseFloat(feeAmount) > 0) {
      const feeAmountNum = parseFloat(feeAmount);
      const amountInNum = parseFloat(amountIn);
      
      if (feeAmountNum >= amountInNum) {
        return {
          success: false,
          error: 'Fee amount cannot be >= swap amount',
        };
      }
      
      actualSwapAmount = (amountInNum - feeAmountNum).toFixed(18);
      
      const feeDecimals = isTokenInBNB ? 18 : await getTokenDecimals(tokenIn, provider);
      feeAmountWei = parseTokenAmount(feeAmount, feeDecimals);
    }

    const tokenInDecimals = isTokenInBNB ? 18 : await getTokenDecimals(tokenIn, provider);
    const tokenOutDecimals = isTokenOutBNB ? 18 : await getTokenDecimals(tokenOut, provider);
    const amountInWei = parseTokenAmount(amountIn, tokenInDecimals);
    const actualSwapAmountWei = parseTokenAmount(actualSwapAmount, tokenInDecimals);

    // Check balance
    if (!isTokenInBNB) {
      const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, provider);
      const balance = await tokenContract.balanceOf(walletAddress);
      
      if (balance < amountInWei) {
        return {
          success: false,
          error: `Insufficient token balance. Have: ${ethers.formatUnits(balance, tokenInDecimals)}, Need: ${amountIn}`,
        };
      }
    } else {
      const balance = await provider.getBalance(walletAddress);
      const gasReserve = ethers.parseEther('0.003'); // Increased reserve
      const availableBalance = balance > gasReserve ? balance - gasReserve : BigInt(0);
      
      if (availableBalance < amountInWei) {
        return {
          success: false,
          error: `Insufficient BNB. Have: ${ethers.formatEther(balance)}, Need: ${ethers.formatEther(amountInWei + gasReserve)}`,
        };
      }
    }

    // Approve tokens BEFORE fee transfer
    // NOTE: For BNB swaps, no approval is needed as we're sending native BNB
    // For token swaps, we need to approve the Universal Router to spend tokens
    if (!isTokenInBNB) {
      console.log('=== Approving tokens ===');
      console.log(`Approving ${ethers.formatUnits(actualSwapAmountWei, tokenInDecimals)} ${tokenIn} for router ${PANCAKESWAP_ROUTER_V4}`);
      
      const approved = await ensureTokenApproval(tokenIn, PANCAKESWAP_ROUTER_V4, actualSwapAmountWei, signer);
      
      if (!approved) {
        throw new Error('Token approval failed');
      }

      // Verify approval with multiple retries
      const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, provider);
      let approvalVerified = false;
      
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const allowance = await tokenContract.allowance(walletAddress, PANCAKESWAP_ROUTER_V4);
        
        console.log(`Approval check ${i + 1}/5: Allowance = ${ethers.formatUnits(allowance, tokenInDecimals)}, Required = ${ethers.formatUnits(actualSwapAmountWei, tokenInDecimals)}`);
        
        if (allowance >= actualSwapAmountWei) {
          approvalVerified = true;
          console.log(`✓ Approval verified: ${ethers.formatUnits(allowance, tokenInDecimals)}`);
          break;
        }
      }
      
      if (!approvalVerified) {
        const finalAllowance = await tokenContract.allowance(walletAddress, PANCAKESWAP_ROUTER_V4);
        return {
          success: false,
          error: `Token approval verification failed. Final allowance: ${ethers.formatUnits(finalAllowance, tokenInDecimals)}, Required: ${ethers.formatUnits(actualSwapAmountWei, tokenInDecimals)}`,
        };
      }
    } else {
      console.log('=== BNB swap - no token approval needed ===');
    }

    // Transfer fee
    if (feeAmountWei && feeRecipientAddress && feeRecipientAddress.trim() !== '') {
      if (!ethers.isAddress(feeRecipientAddress)) {
        return {
          success: false,
          error: `Invalid fee recipient: ${feeRecipientAddress}`,
        };
      }

      if (feeRecipientAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        try {
          console.log('=== Transferring fee ===');
          
          if (isTokenInBNB) {
            // Check balance before fee transfer
            const balance = await provider.getBalance(walletAddress);
            const gasReserve = ethers.parseEther('0.003');
            const totalNeeded = feeAmountWei + gasReserve;
            
            if (balance < totalNeeded) {
              return {
                success: false,
                error: `Insufficient BNB for fee transfer. Have: ${ethers.formatEther(balance)}, Need: ${ethers.formatEther(totalNeeded)}`,
              };
            }
            
            // Check if recipient is a contract
            const code = await provider.getCode(feeRecipientAddress);
            const isContract = code !== '0x';
            
            if (isContract) {
              // Contract recipient - try with higher gas limit in case it has receive() function
              // If it still fails, we'll skip the fee but continue with swap
              try {
                const feeTx = await signer.sendTransaction({
                  to: feeRecipientAddress,
                  value: feeAmountWei,
                  gasLimit: BigInt(100000) // Higher gas for contract calls
                });
                const feeReceipt = await feeTx.wait();
                
                if (feeReceipt.status === 0) {
                  throw new Error('Fee transfer to contract reverted');
                }
                
                console.log(`✓ Fee transferred to contract: ${feeReceipt.hash}`);
              } catch (contractFeeError) {
                // Contract doesn't accept plain transfers - skip fee collection
                console.warn(
                  `⚠️ Fee recipient ${feeRecipientAddress} is a contract that doesn't accept plain transfers. ` +
                  `Skipping fee collection. Consider using an EOA address or a contract with receive() function.`
                );
                // Continue with swap without fee - fee collection is optional
                // If you want to abort swap on fee failure, uncomment the return below:
                // return {
                //   success: false,
                //   error: 'Fee transfer to contract failed. Swap aborted. Please use an EOA fee recipient address.',
                // };
              }
            } else {
              // EOA recipient - standard transfer
              const feeTx = await signer.sendTransaction({
                to: feeRecipientAddress,
                value: feeAmountWei,
                gasLimit: BigInt(21000) // Standard transfer
              });
              const feeReceipt = await feeTx.wait();
              
              if (feeReceipt.status === 0) {
                return {
                  success: false,
                  error: 'Fee transfer transaction reverted. Swap aborted.',
                };
              }
              
              console.log(`✓ Fee transferred: ${feeReceipt.hash}`);
            }
          } else {
            // Check token balance
            const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, provider);
            const balance = await tokenContract.balanceOf(walletAddress);
            
            if (balance < feeAmountWei) {
              return {
                success: false,
                error: `Insufficient token balance for fee transfer. Have: ${ethers.formatUnits(balance, tokenInDecimals)}, Need: ${ethers.formatUnits(feeAmountWei, tokenInDecimals)}`,
              };
            }
            
            const tokenContractWithSigner = new ethers.Contract(tokenIn, ERC20_ABI, signer);
            const feeTx = await tokenContractWithSigner.transfer(feeRecipientAddress, feeAmountWei, {
              gasLimit: BigInt(50000)
            });
            const feeReceipt = await feeTx.wait();
            
            if (feeReceipt.status === 0) {
              return {
                success: false,
                error: 'Fee transfer transaction reverted. Swap aborted.',
              };
            }
            
            console.log(`✓ Fee transferred: ${feeReceipt.hash}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (feeError) {
          console.error('Fee transfer failed:', feeError);
          
          // Check if recipient is a contract
          const code = await provider.getCode(feeRecipientAddress);
          const isContract = code !== '0x';
          
          if (isContract) {
            // Contract recipient failed - skip fee collection but continue with swap
            console.warn(
              `⚠️ Fee transfer to contract ${feeRecipientAddress} failed. ` +
              `Skipping fee collection and continuing with swap. ` +
              `Consider using an EOA address for fee recipient or a contract with receive() function.`
            );
            // Continue with swap - fee collection is optional for contract recipients
          } else {
            // EOA recipient failed - this is unexpected, abort swap
            return {
              success: false,
              error: `Fee transfer to EOA failed: ${feeError instanceof Error ? feeError.message : 'Unknown'}. Swap aborted.`,
            };
          }
        }
      }
    }

    // Verify balance after fee
    if (!isTokenInBNB) {
      const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, provider);
      const currentBalance = await tokenContract.balanceOf(walletAddress);
      
      if (currentBalance < actualSwapAmountWei) {
        return {
          success: false,
          error: `Insufficient balance after fee. Have: ${ethers.formatUnits(currentBalance, tokenInDecimals)}, Need: ${actualSwapAmount}`,
        };
      }
    }

    // Build swap path
    // IMPORTANT: For native BNB swaps, path must use WBNB address
    // The Universal Router will wrap native BNB to WBNB, then swap WBNB -> tokenOut
    const path: string[] = [];
    
    if (isTokenInBNB) {
      // Native BNB input: path starts with WBNB (will be wrapped by WRAP_ETH command)
      path.push(WBNB_ADDRESS);
    } else {
      // Token input: path starts with actual token address
      path.push(tokenIn);
    }
    
    // Add intermediate token if needed (token -> WBNB -> token)
    if (!isTokenInBNB && !isTokenOutBNB) {
      path.push(WBNB_ADDRESS);
    }
    
    // Add output token
    if (isTokenOutBNB) {
      // If output is BNB, path ends with WBNB (will be unwrapped by UNWRAP_WETH command)
      if (!isTokenInBNB) {
        path.push(WBNB_ADDRESS);
      }
      // If input is also BNB, path is just WBNB (no intermediate needed)
    } else {
      path.push(tokenOut);
    }
    
    // Validate path has at least 2 tokens
    if (path.length < 2) {
      return {
        success: false,
        error: `Invalid swap path: must have at least 2 tokens. Path: ${path.join(' -> ')}`,
      };
    }

    // Calculate amountOutMin with slippage
    let amountOutMinWei: bigint;
    if (amountOutMin && parseFloat(amountOutMin) > 0) {
      if (actualSwapAmount !== amountIn) {
        const swapRatio = parseFloat(actualSwapAmount) / parseFloat(amountIn);
        const adjustedMin = (parseFloat(amountOutMin) * swapRatio).toFixed(tokenOutDecimals);
        amountOutMinWei = parseTokenAmount(adjustedMin, tokenOutDecimals);
      } else {
        amountOutMinWei = parseTokenAmount(amountOutMin, tokenOutDecimals);
      }
    } else {
      // Calculate minimum output based on slippage tolerance
      // You should implement actual price fetching here
      console.warn('No amountOutMin provided, using slippage tolerance');
      
      // This is a placeholder - you should fetch actual prices
      const estimatedOutputWei = actualSwapAmountWei; // 1:1 placeholder
      const slippage = BigInt(Math.floor(slippageTolerance * 100));
      amountOutMinWei = (estimatedOutputWei * (BigInt(10000) - slippage)) / BigInt(10000);
    }

    // Use Smart Router SDK to find optimal route and generate commands
    console.log('=== Using Smart Router SDK for optimal routing ===');
    
    try {
      // Create viem client from ethers provider
      const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org';
      const viemClient = createPublicClient({
        chain: bsc,
        transport: http(rpcUrl),
        batch: {
          multicall: {
            batchSize: 1024 * 200,
          },
        },
      }) as any; // Type assertion to avoid account type issues

      // Create subgraph clients (with type assertion to avoid version mismatch)
      const v3SubgraphClient = new GraphQLClient('https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc') as any;
      const v2SubgraphClient = new GraphQLClient('https://proxy-worker-api.pancakeswap.com/bsc-exchange') as any;

      // Create Currency objects
      // For tokens, we need symbol and name - fetch them or use defaults
      const currencyIn = isTokenInBNB 
        ? Native.onChain(BSC_CHAIN_ID) as any
        : new Token(BSC_CHAIN_ID, tokenIn as `0x${string}`, tokenInDecimals, 'TOKEN', 'Token') as any;
      
      const currencyOut = isTokenOutBNB
        ? Native.onChain(BSC_CHAIN_ID) as any
        : new Token(BSC_CHAIN_ID, tokenOut as `0x${string}`, tokenOutDecimals, 'TOKEN', 'Token') as any;

      const amountInCurrency = CurrencyAmount.fromRawAmount(
        currencyIn,
        actualSwapAmountWei.toString()
      ) as any;

      console.log(`Finding best trade route for ${amountInCurrency.toExact()} ${currencyIn.symbol} -> ${currencyOut.symbol}...`);

      // Get candidate pools (V2 and V3)
      // Note: getV2CandidatePools may not need v2SubgraphProvider, check API
      const [v2Pools, v3Pools] = await Promise.all([
        SmartRouter.getV2CandidatePools({
          onChainProvider: () => viemClient,
          v3SubgraphProvider: () => v3SubgraphClient,
          currencyA: currencyIn,
          currencyB: currencyOut,
        }) as any,
        SmartRouter.getV3CandidatePools({
          onChainProvider: () => viemClient,
          subgraphProvider: () => v3SubgraphClient,
          currencyA: currencyIn,
          currencyB: currencyOut,
        }) as any,
      ]);

      console.log(`Found ${v2Pools.length} V2 pools and ${v3Pools.length} V3 pools`);

      // Get best trade
      const trades = await SmartRouter.getBestTrade(
        amountInCurrency,
        currencyOut,
        TradeType.EXACT_INPUT,
        {
          gasPriceWei: async () => {
            const feeData = await provider.getFeeData();
            return feeData.gasPrice || BigInt(0);
          },
          candidatePools: [...v2Pools, ...v3Pools],
        }
      );

      if (!trades || (Array.isArray(trades) && trades.length === 0)) {
        return {
          success: false,
          error: 'No trade route found. This pair may not have sufficient liquidity.',
        };
      }

      const bestTrade = Array.isArray(trades) ? trades[0] : trades;
      console.log(`✓ Best trade found: ${bestTrade.inputAmount.toExact()} ${currencyIn.symbol} -> ${bestTrade.outputAmount.toExact()} ${currencyOut.symbol}`);
      const routePaths = bestTrade.routes?.map((r: any) => r.path?.map((t: any) => t.symbol || t.address).join(' -> ')).join(', ') || 'Direct';
      console.log(`Route: ${routePaths}`);

      // Update amountOutMin based on actual trade output
      if (!amountOutMin || parseFloat(amountOutMin) === 0) {
        const slippagePercent = new Percent(Math.floor(slippageTolerance * 10000), 10000);
        amountOutMinWei = BigInt(bestTrade.minimumAmountOut(slippagePercent).quotient.toString());
      }

      // Generate Universal Router commands using PancakeSwapUniversalRouter
      const swapOptions = {
        recipient: walletAddress as Address,
        slippageTolerance: new Percent(Math.floor(slippageTolerance * 10000), 10000),
        deadline: BigInt(deadline),
        flatFee: feeAmountWei && feeRecipientAddress ? {
          amount: feeAmountWei,
          recipient: feeRecipientAddress as Address,
        } : undefined,
      };

      const methodParams = PancakeSwapUniversalRouter.swapERC20CallParameters(
        bestTrade,
        swapOptions
      );

      console.log(`✓ Generated Universal Router calldata`);

      // Verify router address
      console.log(`Using PancakeSwap Universal Router: ${PANCAKESWAP_ROUTER_V4}`);
      
      const router = new ethers.Contract(PANCAKESWAP_ROUTER_V4, UNIVERSAL_ROUTER_ABI, signer);
      
      // Verify the contract code exists
      const code = await provider.getCode(PANCAKESWAP_ROUTER_V4);
      if (code === '0x') {
        return {
          success: false,
          error: `Router address ${PANCAKESWAP_ROUTER_V4} has no code. Please verify the router address is correct.`,
        };
      }
      console.log(`✓ Router contract verified (code length: ${code.length} bytes)`);

      // Decode the calldata to get commands and inputs
      // MethodParameters contains calldata which we need to decode
      // For now, let's use the calldata directly if it's for execute function
      // Otherwise, we'll need to decode it
      const calldata = methodParams.calldata as string;
      
      // Decode the calldata to extract commands, inputs, and deadline
      const decoded = PancakeSwapUniversalRouter.decodeCallData(calldata as any);
      
      // The decoded data should contain the commands and inputs
      // For execute function: execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline)
      // We need to extract these from the calldata
      
      // Parse the calldata - it should start with function selector for execute
      // execute(bytes,bytes[],uint256) selector: 0x3593564c
      const executeSelector = '0x3593564c';
      if (!calldata.startsWith(executeSelector)) {
        return {
          success: false,
          error: 'Invalid calldata format. Expected execute function.',
        };
      }

      // Decode the parameters from calldata
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const params = abiCoder.decode(
        ['bytes', 'bytes[]', 'uint256'],
        '0x' + calldata.slice(10) // Remove function selector
      );
      
      const commands = params[0] as string;
      const inputs = params[1] as string[];
      const routerDeadline = Number(params[2] as bigint);
      
      // Calculate value to send (BNB amount for native swaps)
      const valueToSend = isTokenInBNB ? actualSwapAmountWei : BigInt(0);

      console.log('=== Executing swap with Smart Router generated commands ===');
      console.log(`Commands: ${commands}`);
      console.log(`Commands hex: ${ethers.hexlify(commands)}`);
      console.log(`Inputs count: ${inputs.length}`);
      for (let i = 0; i < inputs.length; i++) {
        console.log(`Input ${i}: ${inputs[i].substring(0, 200)}${inputs[i].length > 200 ? '...' : ''}`);
      }
      console.log(`Amount In: ${bestTrade.inputAmount.toExact()} ${currencyIn.symbol}`);
      console.log(`Amount Out: ${bestTrade.outputAmount.toExact()} ${currencyOut.symbol}`);
      console.log(`Min Out: ${ethers.formatUnits(amountOutMinWei, tokenOutDecimals)} ${currencyOut.symbol}`);
      console.log(`Deadline: ${routerDeadline} (${new Date(routerDeadline * 1000).toISOString()})`);

      // Validate swap with callStatic before submitting
      const executeFunction = router.getFunction('execute(bytes,bytes[],uint256)');
      
      try {
        console.log('=== Validating swap with callStatic ===');
        console.log(`Sending value: ${ethers.formatEther(valueToSend)} BNB`);
        console.log(`Commands: ${commands}`);
        console.log(`Inputs length: ${inputs.length}`);
        
        await executeFunction.staticCall(
          commands,
          inputs,
          routerDeadline,
          { value: valueToSend }
        );
        console.log('✓ Swap validation passed');
      } catch (validationError) {
        console.error('Swap validation failed:', validationError);
        
        // Provide more specific error messages
        let errorMessage = 'Unknown error';
        if (validationError instanceof Error) {
          errorMessage = validationError.message;
          
          // Check for specific error types
          if (errorMessage.includes('TRANSFER_FAILED')) {
            errorMessage = 'TRANSFER_FAILED: Token transfer failed. Please ensure: 1) Token approval is sufficient, 2) Token balance is sufficient, 3) No transfer taxes are affecting the amount.';
          } else if (errorMessage.includes('require(false)')) {
            errorMessage = 'Validation failed: Router rejected the swap. This may indicate: 1) Unsupported command/swap type, 2) Invalid path or amounts, 3) Router does not support this swap configuration.';
          }
        }
        
        return {
          success: false,
          error: `Swap validation failed: ${errorMessage}. Transaction would revert on-chain.`,
        };
      }

      // Estimate gas
      let estimatedGas: bigint;
      try {
        estimatedGas = await estimateSwapGas(router, commands, inputs, routerDeadline, valueToSend);
        console.log(`Estimated gas: ${estimatedGas.toString()}`);
      } catch (gasError) {
        console.error('Gas estimation failed:', gasError);
        return {
          success: false,
          error: `Gas estimation failed: ${gasError instanceof Error ? gasError.message : 'Unknown error'}. This indicates the swap would revert.`,
        };
      }

      // Execute swap
      const tx = await executeFunction(
        commands,
        inputs,
        routerDeadline,
        {
          value: valueToSend,
          gasLimit: estimatedGas,
          gasPrice: (await signer.provider.getFeeData()).gasPrice || undefined,
        }
      );

      console.log(`✓ Swap submitted: ${tx.hash}`);
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }

      if (receipt.status === 0) {
        throw new Error('Transaction reverted');
      }

      console.log(`✓ Swap confirmed in block ${receipt.blockNumber}`);

      // Use the actual output amount from the trade
      const actualAmountOut = bestTrade.outputAmount.toExact();

      return {
        success: true,
        transactionHash: receipt.hash,
        amountOut: actualAmountOut,
      };
    } catch (smartRouterError) {
      console.error('Smart Router integration failed:', smartRouterError);
      
      // Fallback to manual encoding if Smart Router fails
      console.log('⚠️ Falling back to manual command encoding...');
      
      // Verify router address
      console.log(`Using PancakeSwap Universal Router: ${PANCAKESWAP_ROUTER_V4}`);
      
      const router = new ethers.Contract(PANCAKESWAP_ROUTER_V4, UNIVERSAL_ROUTER_ABI, signer);
      
      // Verify the contract code exists
      const code = await provider.getCode(PANCAKESWAP_ROUTER_V4);
      if (code === '0x') {
        return {
          success: false,
          error: `Router address ${PANCAKESWAP_ROUTER_V4} has no code. Please verify the router address is correct.`,
        };
      }
      console.log(`✓ Router contract verified (code length: ${code.length} bytes)`);

      // Encode swap command (fallback)
      const swapPath = path.map(addr => addr.toLowerCase() === WBNB_ADDRESS.toLowerCase() ? WBNB_ADDRESS : addr);
      const { commands, inputs } = encodeSwapCommand(
        isTokenInBNB ? WBNB_ADDRESS : tokenIn,
        isTokenOutBNB ? WBNB_ADDRESS : tokenOut,
        actualSwapAmountWei,
        amountOutMinWei,
        walletAddress,
        swapPath,
        isTokenInBNB,
        isTokenOutBNB
      );

      console.log('=== Executing swap (fallback mode) ===');
      console.log(`Commands: ${commands}`);
      console.log(`Path: ${path.join(' -> ')}`);

      // Validate swap with callStatic before submitting
      const valueToSend = isTokenInBNB ? actualSwapAmountWei : BigInt(0);
      const executeFunction = router.getFunction('execute(bytes,bytes[],uint256)');
      
      try {
        console.log('=== Validating swap with callStatic ===');
        await executeFunction.staticCall(
          commands,
          inputs,
          deadline,
          { value: valueToSend }
        );
        console.log('✓ Swap validation passed');
      } catch (validationError) {
        console.error('Swap validation failed:', validationError);
        return {
          success: false,
          error: `Swap validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown error'}. Transaction would revert on-chain.`,
        };
      }

      // Estimate gas
      let estimatedGas: bigint;
      try {
        estimatedGas = await estimateSwapGas(router, commands, inputs, deadline, valueToSend);
        console.log(`Estimated gas: ${estimatedGas.toString()}`);
      } catch (gasError) {
        console.error('Gas estimation failed:', gasError);
        return {
          success: false,
          error: `Gas estimation failed: ${gasError instanceof Error ? gasError.message : 'Unknown error'}. This indicates the swap would revert.`,
        };
      }

      // Execute swap
      const tx = await executeFunction(
        commands,
        inputs,
        deadline,
        {
          value: valueToSend,
          gasLimit: estimatedGas,
          gasPrice: (await signer.provider.getFeeData()).gasPrice || undefined,
        }
      );

      console.log(`✓ Swap submitted: ${tx.hash}`);
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }

      if (receipt.status === 0) {
        throw new Error('Transaction reverted');
      }

      console.log(`✓ Swap confirmed in block ${receipt.blockNumber}`);

      return {
        success: true,
        transactionHash: receipt.hash,
        amountOut: amountOutMin || '0',
      };
    }
  } catch (error) {
      console.error('Swap failed:', error);
      
      // Try to get more detailed error info
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Check for revert data
        if ('code' in error && (error as any).code === 'CALL_EXCEPTION') {
          const txError = error as any;
          if (txError.revert?.data) {
            console.error('Revert data:', txError.revert.data);
          }
        }
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string
): Promise<{ amountOut: string; path: string[] }> {
  const provider = getBSCProvider();
  
  const tokenInLower = tokenIn.toLowerCase();
  const tokenOutLower = tokenOut.toLowerCase();

  if (tokenInLower === tokenOutLower) {
    throw new Error('Cannot swap the same token');
  }

  const isTokenInBNB = tokenInLower === WBNB_ADDRESS.toLowerCase() || 
                       tokenInLower === ethers.ZeroAddress.toLowerCase() ||
                       tokenInLower === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const isTokenOutBNB = tokenOutLower === WBNB_ADDRESS.toLowerCase() || 
                        tokenOutLower === ethers.ZeroAddress.toLowerCase() ||
                        tokenOutLower === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

  const path: string[] = [];
  
  if (isTokenInBNB) {
    path.push(WBNB_ADDRESS);
  } else {
    path.push(tokenIn);
  }
  
  if (!isTokenInBNB && !isTokenOutBNB) {
    path.push(WBNB_ADDRESS);
  }
  
  if (isTokenOutBNB) {
    if (!isTokenInBNB) {
      path.push(WBNB_ADDRESS);
    }
  } else {
    path.push(tokenOut);
  }

  if (path.length < 2) {
    throw new Error(`Invalid path: must have at least 2 tokens`);
  }

  return {
    amountOut: '0', // Caller should provide amountOutMin
    path,
  };
}