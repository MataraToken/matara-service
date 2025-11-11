import { ethers } from "ethers";
import Transaction from "../model/transaction.model";
import User from "../model/user.model";
import { createTransaction, updateTransactionStatus } from "./transaction.service";

// Standard ERC20 Transfer event signature
const ERC20_TRANSFER_EVENT = "Transfer(address,address,uint256)";
const ERC20_TRANSFER_TOPIC = ethers.id(ERC20_TRANSFER_EVENT);

// WBNB address on BSC
const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

//https://bsc-dataseed.bnbchain.org/

interface DepositListenerConfig {
  rpcUrl: string;
  chain: string;
  startBlock?: number;
  confirmationBlocks?: number;
  blockCheckInterval?: number; // Interval in milliseconds to check for new blocks (default: 20000 = 20s)
  maxBlocksPerIteration?: number; // Max blocks to process per iteration (default: 3)
}

class DepositListenerService {
  private provider: ethers.JsonRpcProvider | null = null;
  private isRunning: boolean = false;
  private currentBlock: number = 0;
  private config: DepositListenerConfig;
  private checkInterval: NodeJS.Timeout | null = null;
  private processingTransactions: Set<string> = new Set(); // Track transactions being processed
  private rateLimitDelay: number = 1000; // Initial delay between requests (1 second)
  private maxRetries: number = 3;

  constructor(config: DepositListenerConfig) {
    this.config = {
      ...config,
      confirmationBlocks: config.confirmationBlocks || 3,
      blockCheckInterval: config.blockCheckInterval || 20000, // Default 20 seconds
      maxBlocksPerIteration: config.maxBlocksPerIteration || 3, // Default 3 blocks per iteration
    };
  }

  /**
   * Initialize the provider and start listening
   */
  async start() {
    if (this.isRunning) {
      console.log("Deposit listener is already running");
      return;
    }

    try {
      // Create provider - timeouts will be handled by retry logic
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl, undefined, {
        staticNetwork: null,
        batchMaxCount: 1, // Disable batching to avoid timeout issues
        batchStallTime: 0,
        polling: false,
      });

      const network = await this.provider.getNetwork();
      console.log(`Connected to ${this.config.chain} network: ${network.name}`);

      // Get current block number
      this.currentBlock = this.config.startBlock || (await this.provider.getBlockNumber());
      console.log(`Starting deposit listener from block ${this.currentBlock}`);

      this.isRunning = true;

      // Start checking for new blocks
      this.startBlockListener();
    } catch (error) {
      console.error("Error starting deposit listener:", error);
      throw error;
    }
  }

  /**
   * Stop the deposit listener
   */
  stop() {
    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log("Deposit listener stopped");
  }

  /**
   * Start listening for new blocks
   */
  private startBlockListener() {
    const checkInterval = this.config.blockCheckInterval || 20000; // Default 20 seconds
    const maxBlocksPerIteration = this.config.maxBlocksPerIteration || 3;
    
    console.log(`Starting block listener with ${checkInterval / 1000}s interval, processing max ${maxBlocksPerIteration} blocks per iteration`);
    
    // Check for new blocks at configured interval
    this.checkInterval = setInterval(async () => {
      if (!this.isRunning || !this.provider) return;

      try {
        // Use retry logic for getBlockNumber to handle timeouts
        const latestBlock = await this.retryWithBackoff(async () => {
          return await this.provider!.getBlockNumber();
        });
        
        // Process blocks from current to latest, but limit batch size
        const blocksToProcess = Math.min(
          latestBlock - this.currentBlock,
          maxBlocksPerIteration
        );
        
        if (blocksToProcess > 0) {
          console.log(`Processing ${blocksToProcess} block(s) (current: ${this.currentBlock}, latest: ${latestBlock})`);
        }
        
        for (let i = 0; i < blocksToProcess; i++) {
          const blockNum = this.currentBlock + 1 + i;
          await this.processBlock(blockNum);
          // Add delay between blocks to avoid rate limits
          await this.delay(this.rateLimitDelay);
        }
        
        this.currentBlock = Math.min(this.currentBlock + blocksToProcess, latestBlock);
        
        // Reset rate limit delay if no errors (gradually decrease)
        if (blocksToProcess > 0) {
          this.rateLimitDelay = Math.max(this.rateLimitDelay * 0.95, 500); // Gradually reduce delay, min 500ms
        }
      } catch (error: any) {
        // Only log non-timeout errors to reduce noise
        if (error.code !== 'TIMEOUT' && error.shortMessage !== 'request timeout') {
          console.error("Error in block listener:", error);
        }
        // Increase delay on error (timeout or other)
        this.rateLimitDelay = Math.min(this.rateLimitDelay * 1.5, 10000);
      }
    }, checkInterval);
  }

  /**
   * Delay helper function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry helper with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number = this.maxRetries,
    delayMs: number = 1000
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      // Retry on timeout, rate limit, or bad data errors
      const isRetryableError = 
        error.code === 'TIMEOUT' ||
        error.code === 'BAD_DATA' ||
        error.message?.includes('timeout') ||
        error.message?.includes('rate limit') ||
        error.shortMessage === 'request timeout';
      
      if (retries > 0 && isRetryableError) {
        const errorType = error.code === 'TIMEOUT' || error.shortMessage === 'request timeout' 
          ? 'Timeout' 
          : 'Rate limit';
        console.warn(`${errorType} hit, retrying in ${delayMs}ms... (${retries} retries left)`);
        await this.delay(delayMs);
        return this.retryWithBackoff(fn, retries - 1, delayMs * 2);
      }
      throw error;
    }
  }

  /**
   * Process a single block for deposits
   */
  private async processBlock(blockNumber: number) {
    if (!this.provider) return;

    try {
      // Use retry logic for getBlock to handle timeouts
      const block = await this.retryWithBackoff(async () => {
        return await this.provider!.getBlock(blockNumber, true);
      });
      
      if (!block || !block.transactions) return;

      // Get all user wallet addresses to monitor
      const users = await User.find({ walletAddress: { $exists: true, $ne: null } })
        .select("_id walletAddress")
        .lean();

      const walletAddresses = users.map((u) => u.walletAddress?.toLowerCase()).filter(Boolean) as string[];
      
      if (walletAddresses.length === 0) return;

      // Process each transaction in the block
      for (const txHash of block.transactions) {
        if (typeof txHash !== "string") continue;

        // Skip if already processing this transaction
        if (this.processingTransactions.has(txHash)) {
          continue;
        }

        try {
          this.processingTransactions.add(txHash);
          
          // Use retry logic for transaction fetching
          const tx = await this.retryWithBackoff(async () => {
            return await this.provider!.getTransaction(txHash);
          });
          
          if (!tx) {
            this.processingTransactions.delete(txHash);
            continue;
          }

          // Check if transaction is to a monitored wallet
          const toAddress = tx.to?.toLowerCase();
          if (!toAddress || !walletAddresses.includes(toAddress)) continue;

          // Check if it's a native BNB transfer
          if (tx.value && tx.value > BigInt(0)) {
            await this.handleNativeDeposit(tx, block, toAddress, users);
          }

          // Check if it's a token transfer (ERC20)
          if (tx.to && tx.to.toLowerCase() !== WBNB_ADDRESS.toLowerCase()) {
            await this.handleTokenDeposit(tx, block, toAddress, users);
          }
          
          this.processingTransactions.delete(txHash);
        } catch (txError: any) {
          this.processingTransactions.delete(txHash);
          
          // Only log non-retryable errors (timeout, rate limit, bad data are handled by retry)
          const isRetryableError = 
            txError.code === 'TIMEOUT' ||
            txError.code === 'BAD_DATA' ||
            txError.message?.includes('timeout') ||
            txError.message?.includes('rate limit') ||
            txError.shortMessage === 'request timeout';
          
          if (!isRetryableError) {
            console.error(`Error processing transaction ${txHash}:`, txError);
          }
          
          // If rate limited or timeout, increase delay
          if (isRetryableError) {
            this.rateLimitDelay = Math.min(this.rateLimitDelay * 1.2, 10000);
            if (txError.code === 'TIMEOUT' || txError.shortMessage === 'request timeout') {
              console.warn(`Timeout detected, increasing delay to ${this.rateLimitDelay}ms`);
            } else {
              console.warn(`Rate limit detected, increasing delay to ${this.rateLimitDelay}ms`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    }
  }

  /**
   * Handle native BNB deposit
   */
  private async handleNativeDeposit(
    tx: ethers.TransactionResponse,
    block: ethers.Block,
    toAddress: string,
    users: Array<{ _id: any; walletAddress?: string }>
  ) {
    try {
      const user = users.find((u) => u.walletAddress?.toLowerCase() === toAddress);
      if (!user) return;

      // Check if transaction already exists
      const existing = await Transaction.findOne({
        transactionHash: tx.hash.toLowerCase(),
      });

      if (existing) {
        // Update if needed
        if (existing.status === "pending") {
          await updateTransactionStatus(tx.hash, "confirmed", {
            blockNumber: block.number,
            blockHash: block.hash,
            transactionTimestamp: new Date(Number(block.timestamp) * 1000),
            confirmations: 1,
          });
        }
        return;
      }

      // Get transaction receipt for gas info with retry
      const receipt = await this.retryWithBackoff(async () => {
        return await this.provider!.getTransactionReceipt(tx.hash);
      });
      const gasFee = receipt
        ? ethers.formatEther((receipt.gasUsed * (receipt.gasPrice || BigInt(0))).toString())
        : "0";

      // Create transaction record
      await createTransaction({
        userId: user._id.toString(),
        walletAddress: toAddress,
        chain: this.config.chain,
        type: "deposit",
        transactionHash: tx.hash,
        blockNumber: block.number,
        blockHash: block.hash,
        from: tx.from?.toLowerCase(),
        to: toAddress,
        tokenAddress: ethers.ZeroAddress, // Native BNB
        tokenSymbol: "BNB",
        amount: ethers.formatEther(tx.value),
        amountFormatted: ethers.formatEther(tx.value),
        gasUsed: receipt?.gasUsed.toString(),
        gasPrice: receipt?.gasPrice?.toString(),
        gasFee,
        status: receipt ? "confirmed" : "pending",
        confirmations: receipt ? 1 : 0,
        transactionTimestamp: new Date(Number(block.timestamp) * 1000),
        confirmedAt: receipt ? new Date() : undefined,
      });

      console.log(`Logged BNB deposit: ${tx.hash} to ${toAddress}`);
    } catch (error) {
      console.error("Error handling native deposit:", error);
    }
  }

  /**
   * Handle ERC20 token deposit
   */
  private async handleTokenDeposit(
    tx: ethers.TransactionResponse,
    block: ethers.Block,
    toAddress: string,
    users: Array<{ _id: any; walletAddress?: string }>
  ) {
    try {
      const user = users.find((u) => u.walletAddress?.toLowerCase() === toAddress);
      if (!user) return;

      // Get transaction receipt to check for Transfer events with retry
      const receipt = await this.retryWithBackoff(async () => {
        return await this.provider!.getTransactionReceipt(tx.hash);
      });
      if (!receipt || !receipt.logs) return;

      // Check for Transfer events
      for (const log of receipt.logs) {
        if (log.topics[0] === ERC20_TRANSFER_TOPIC) {
          // Parse Transfer event
          const transferInterface = new ethers.Interface([
            "event Transfer(address indexed from, address indexed to, uint256 value)",
          ]);
          
          try {
            const parsedLog = transferInterface.parseLog({
              topics: log.topics,
              data: log.data,
            });

            if (!parsedLog) continue;

            const from = parsedLog.args[0].toLowerCase();
            const to = parsedLog.args[1].toLowerCase();
            const value = parsedLog.args[2];

            // Only process if it's a deposit (to our monitored wallet)
            if (to !== toAddress) continue;

            // Check if transaction already exists
            const existing = await Transaction.findOne({
              transactionHash: tx.hash.toLowerCase(),
              tokenAddress: log.address.toLowerCase(),
            });

            if (existing) {
              if (existing.status === "pending") {
                await updateTransactionStatus(tx.hash, "confirmed", {
                  blockNumber: block.number,
                  blockHash: block.hash,
                  transactionTimestamp: new Date(Number(block.timestamp) * 1000),
                  confirmations: 1,
                });
              }
              continue;
            }

            // Get token info (symbol, decimals)
            const tokenContract = new ethers.Contract(
              log.address,
              ["function symbol() view returns (string)", "function decimals() view returns (uint8)"],
              this.provider!
            );

            let tokenSymbol = "UNKNOWN";
            let decimals = 18;

            try {
              tokenSymbol = await tokenContract.symbol();
              decimals = await tokenContract.decimals();
            } catch (tokenError) {
              console.warn(`Could not get token info for ${log.address}:`, tokenError);
            }

            const amount = ethers.formatUnits(value, decimals);
            const gasFee = receipt
              ? ethers.formatEther((receipt.gasUsed * (receipt.gasPrice || BigInt(0))).toString())
              : "0";

            // Create transaction record
            await createTransaction({
              userId: user._id.toString(),
              walletAddress: toAddress,
              chain: this.config.chain,
              type: "deposit",
              transactionHash: tx.hash,
              blockNumber: block.number,
              blockHash: block.hash,
              from: from,
              to: to,
              tokenAddress: log.address.toLowerCase(),
              tokenSymbol,
              amount: value.toString(),
              amountFormatted: amount,
              gasUsed: receipt.gasUsed.toString(),
              gasPrice: receipt.gasPrice?.toString(),
              gasFee,
              status: "confirmed",
              confirmations: 1,
              transactionTimestamp: new Date(Number(block.timestamp) * 1000),
              confirmedAt: new Date(),
            });

            console.log(`Logged token deposit: ${tokenSymbol} (${amount}) to ${toAddress} - ${tx.hash}`);
          } catch (parseError) {
            console.error("Error parsing Transfer event:", parseError);
          }
        }
      }
    } catch (error) {
      console.error("Error handling token deposit:", error);
    }
  }
}

// Singleton instance
let depositListenerInstance: DepositListenerService | null = null;

/**
 * Get or create deposit listener instance
 */
export function getDepositListener(): DepositListenerService {
  if (!depositListenerInstance) {
    const rpcUrl = process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org/";
    // Configurable interval: 20s default, can be overridden with env var (in seconds)
    const blockCheckInterval = process.env.DEPOSIT_LISTENER_INTERVAL 
      ? parseInt(process.env.DEPOSIT_LISTENER_INTERVAL) * 1000 
      : 20000; // Default 20 seconds
    const maxBlocksPerIteration = process.env.DEPOSIT_LISTENER_MAX_BLOCKS
      ? parseInt(process.env.DEPOSIT_LISTENER_MAX_BLOCKS)
      : 3; // Default 3 blocks per iteration
    
    depositListenerInstance = new DepositListenerService({
      rpcUrl,
      chain: "BSC",
      confirmationBlocks: 3,
      blockCheckInterval,
      maxBlocksPerIteration,
    });
  }
  return depositListenerInstance;
}

/**
 * Start the deposit listener
 */
export async function startDepositListener() {
  const listener = getDepositListener();
  await listener.start();
}

/**
 * Stop the deposit listener
 */
export function stopDepositListener() {
  if (depositListenerInstance) {
    depositListenerInstance.stop();
  }
}

export default DepositListenerService;

