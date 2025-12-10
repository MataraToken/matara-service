import { ethers } from 'ethers';
import { decryptPrivateKey } from './index';

// Standard ERC20 ABI for token transfers
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];



interface TransferParams {
  tokenAddress: string; // Token contract address (use ZeroAddress for native BNB)
  toAddress: string; // Recipient address
  amount: string; // Amount to send (as string, will be parsed based on token decimals)
  fromWalletAddress: string; // Sender wallet address
  encryptedPrivateKey: string; // Encrypted private key of sender
  tokenSymbol?: string; // Optional token symbol for logging
}

interface TransferResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  gasUsed?: string;
  gasFee?: string;
}

/**
 * Get BSC provider
 */
function getBSCProvider(): ethers.JsonRpcProvider {
  const rpcUrl = process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org/";
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Get wallet signer from encrypted private keyxx
 */
function getWalletSigner(encryptedPrivateKey: string, walletAddress: string): ethers.Wallet {
  const provider = getBSCProvider();
  const encryptionPassword = process.env.WALLET_ENCRYPTION_PASSWORD || 'default-encryption-key';
  const privateKey = decryptPrivateKey(encryptedPrivateKey, encryptionPassword);
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Get token decimals
 */
async function getTokenDecimals(tokenAddress: string, provider: ethers.Provider): Promise<number> {
  if (tokenAddress.toLowerCase() === ethers.ZeroAddress.toLowerCase() ||
      tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
    return 18; // Native BNB has 18 decimals
  }

  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    const decimals = await tokenContract.decimals();
    return Number(decimals);
  } catch (error) {
    console.error('Error getting token decimals:', error);
    throw new Error(`Failed to get token decimals: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}



/**
 * Parse token amount to BigInt
 */
function parseTokenAmount(amount: string, decimals: number): bigint {
  try {
    return ethers.parseUnits(amount, decimals);
  } catch (error) {
    throw new Error(`Invalid amount format: ${amount}`);
  }
}

/**
 * Check BNB balance for gas fees
 */
async function checkGasBalance(
  signer: ethers.Wallet,
  estimatedGasCost?: bigint
): Promise<{ sufficient: boolean; balance: string; required: string; error?: string }> {
  try {
    const balance = await signer.provider.getBalance(signer.address);
    const balanceBNB = ethers.formatEther(balance);
    
    // Reserve some BNB for gas (default 0.01 BNB or estimated cost + 20%)
    const reserveAmount = estimatedGasCost 
      ? estimatedGasCost + (estimatedGasCost / BigInt(5)) // 20% buffer
      : ethers.parseEther("0.01");


      
    
    const requiredBNB = ethers.formatEther(reserveAmount);
    
    if (balance < reserveAmount) {
      return {
        sufficient: false,
        balance: balanceBNB,
        required: requiredBNB,
        error: `Insufficient BNB for gas. Balance: ${balanceBNB} BNB, Required: ${requiredBNB} BNB`,
      };
    }
    
    return {
      sufficient: true,
      balance: balanceBNB,
      required: requiredBNB,
    };
  } catch (error) {
    return {
      sufficient: false,
      balance: "0",
      required: "0.01",
      error: `Error checking balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check token balance
 */
async function checkTokenBalance(
  tokenAddress: string,
  walletAddress: string,
  requiredAmount: bigint,
  provider: ethers.Provider
): Promise<{ sufficient: boolean; balance: string; required: string; error?: string }> {
  try {
    if (tokenAddress.toLowerCase() === ethers.ZeroAddress.toLowerCase() ||
        tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      // Native BNB - check balance
      const balance = await provider.getBalance(walletAddress);
      const balanceBNB = ethers.formatEther(balance);
      const requiredBNB = ethers.formatEther(requiredAmount);
      
      if (balance < requiredAmount) {
        return {
          sufficient: false,
          balance: balanceBNB,
          required: requiredBNB,
          error: `Insufficient BNB. Balance: ${balanceBNB} BNB, Required: ${requiredBNB} BNB`,
        };
      }
      
      return {
        sufficient: true,
        balance: balanceBNB,
        required: requiredBNB,
      };
    } else {
      // ERC20 token
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const balance = await tokenContract.balanceOf(walletAddress);
      const decimals = await getTokenDecimals(tokenAddress, provider);
      const balanceFormatted = ethers.formatUnits(balance, decimals);
      const requiredFormatted = ethers.formatUnits(requiredAmount, decimals);
      
      if (balance < requiredAmount) {
        return {
          sufficient: false,
          balance: balanceFormatted,
          required: requiredFormatted,
          error: `Insufficient token balance. Balance: ${balanceFormatted}, Required: ${requiredFormatted}`,
        };
      }
      
      return {
        sufficient: true,
        balance: balanceFormatted,
        required: requiredFormatted,
      };
    }
  } catch (error) {
    return {
      sufficient: false,
      balance: "0",
      required: "0",
      error: `Error checking token balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}



export async function executeBSCTokenTransfer(params: TransferParams): Promise<TransferResult> {
  try {
    const {
      tokenAddress,
      toAddress,
      amount,
      fromWalletAddress,
      encryptedPrivateKey,
    } = params;

    const provider = getBSCProvider();
    const signer = getWalletSigner(encryptedPrivateKey, fromWalletAddress);

    // Validate signer
    if (signer.address.toLowerCase() !== fromWalletAddress.toLowerCase()) {
      throw new Error('Wallet address mismatch');
    }

    if (!ethers.isAddress(toAddress)) {
      throw new Error('Invalid recipient address');
    }

    //------------------------------------------------------------
    // 1. CHECK NATIVE OR ERC20
    //------------------------------------------------------------

    const isNativeBNB =
      tokenAddress.toLowerCase() === "native" ||
      tokenAddress.toLowerCase() === ethers.ZeroAddress.toLowerCase() ||
      tokenAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    //------------------------------------------------------------
    // 2. DETERMINE AMOUNT IN WEI
    //------------------------------------------------------------

    let amountWei: bigint;

    if (isNativeBNB) {
      amountWei = ethers.parseEther(amount.toString());
    } else {
      const decimals = await getTokenDecimals(tokenAddress, provider);
      amountWei = parseTokenAmount(amount, decimals);
    }

    //------------------------------------------------------------
    // 3. BALANCE CHECK
    //------------------------------------------------------------

    if (isNativeBNB) {
      // Check BNB balance directly
      const balance = await provider.getBalance(fromWalletAddress);
      if (balance < amountWei) {
        return { success: false, error: "Insufficient BNB balance" };
      }
    } else {
      // ERC20 balance
      const balanceCheck = await checkTokenBalance(tokenAddress, fromWalletAddress, amountWei, provider);
      if (!balanceCheck.sufficient) {
        return {
          success: false,
          error: balanceCheck.error || "Insufficient token balance",
        };
      }
    }

    //------------------------------------------------------------
    // 4. GAS ESTIMATION
    //------------------------------------------------------------

    let estimatedGas: bigint | undefined;

    try {
      if (isNativeBNB) {
        estimatedGas = await provider.estimateGas({
          to: toAddress,
          value: amountWei,
          from: fromWalletAddress,
        });
      } else {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        estimatedGas = await tokenContract.transfer.estimateGas(toAddress, amountWei);
      }
    } catch (err) {
      console.warn("Gas estimation failed:", err);
      // continue — you may still have enough gas
    }

    //------------------------------------------------------------
    // 5. CHECK GAS BALANCE
    //------------------------------------------------------------

    const gasCheck = await checkGasBalance(signer, estimatedGas);
    if (!gasCheck.sufficient) {
      return { success: false, error: gasCheck.error || "Insufficient BNB for gas fees" };
    }

    //------------------------------------------------------------
    // 6. EXECUTE TRANSFER
    //------------------------------------------------------------

    let receipt: ethers.TransactionReceipt;

    if (isNativeBNB) {
      const tx = await signer.sendTransaction({
        to: toAddress,
        value: amountWei,
      });
      receipt = await tx.wait();
    } else {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      const tx = await tokenContract.transfer(toAddress, amountWei);
      receipt = await tx.wait();
    }

    //------------------------------------------------------------
    // 7. FINISH
    //------------------------------------------------------------

    const gasFee = receipt.gasUsed * (receipt.gasPrice || BigInt(0));
    const gasFeeBNB = ethers.formatEther(gasFee);

    return {
      success: true,
      transactionHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
      gasFee: gasFeeBNB,
    };

  } catch (error) {
    console.error("Error executing BSC token transfer:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get token info (symbol, decimals)
 */
export async function getTokenInfo(tokenAddress: string): Promise<{ symbol: string; decimals: number }> {
  try {
    if (tokenAddress.toLowerCase() === ethers.ZeroAddress.toLowerCase() ||
        tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      return {
        symbol: 'BNB',
        decimals: 18,
      };
    }

    const provider = getBSCProvider();
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const [symbol, decimals] = await Promise.all([
      tokenContract.symbol(),
      tokenContract.decimals(),
    ]);

    return {
      symbol: symbol || 'UNKNOWN',
      decimals: Number(decimals) || 18,
    };
  } catch (error) {
    console.error('Error getting token info:', error);
    return {
      symbol: 'UNKNOWN',
      decimals: 18,
    };
  }
}

