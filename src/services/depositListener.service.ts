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
      // Retry on timeout, rate limit, bad data. Do NOT retry -32005 "limit exceeded" (request shape; handled by getLogs fallback).
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
      // Use retry logic for getBlock (false = hashes only; avoids prefetched tx object vs hash bugs)
      const block = await this.retryWithBackoff(async () => {
        return await this.provider!.getBlock(blockNumber, false);
      });
      
      if (!block || !block.transactions) return;

      // Get all user wallet addresses to monitor
      const users = await User.find({ walletAddress: { $exists: true, $ne: null } })
        .select("_id walletAddress")
        .lean();

      const walletAddresses = users.map((u) => u.walletAddress?.toLowerCase()).filter(Boolean) as string[];
      
      if (walletAddresses.length === 0) return;

      // --- Native BNB: tx.to must be a monitored wallet and tx.value > 0 ---
      for (const txRef of block.transactions) {
        const txHash = typeof txRef === "string" ? txRef : (txRef as ethers.TransactionResponse).hash;
        if (!txHash || this.processingTransactions.has(txHash)) continue;

        try {
          this.processingTransactions.add(txHash);
          const tx = await this.retryWithBackoff(async () => this.provider!.getTransaction(txHash));
          this.processingTransactions.delete(txHash);

          if (!tx) continue;

          const toAddress = tx.to?.toLowerCase();
          if (!toAddress || !walletAddresses.includes(toAddress)) continue;

          if (tx.value && tx.value > BigInt(0)) {
            await this.handleNativeDeposit(tx, block, toAddress, users);
          }
        } catch (txError: any) {
          this.processingTransactions.delete(txHash);
          const isRetryable =
            txError.code === "TIMEOUT" ||
            txError.code === "BAD_DATA" ||
            txError.message?.includes("timeout") ||
            txError.message?.includes("rate limit") ||
            txError.shortMessage === "request timeout";
          if (!isRetryable) console.error(`Error processing tx ${txHash}:`, txError);
          if (isRetryable) this.rateLimitDelay = Math.min(this.rateLimitDelay * 1.2, 10000);
        }
      }

      // --- ERC20: use getLogs for Transfer(to=our wallets). tx.to is the token contract, so we cannot filter by tx.to. ---
      await this.processERC20DepositsFromLogs(blockNumber, block, walletAddresses, users);
    } catch (error) {
      console.error(`Error processing block ${blockNumber}:`, error);
    }
  }

  /**
   * Find ERC20 Transfer logs where the recipient (to) is one of our monitored wallets, and create deposit records.
   * Uses getLogs because for token transfers tx.to is the token contract, not the recipient.
   * Chunks wallet topics to avoid RPC "limit exceeded" (-32005) when many wallets are monitored.
   */
  private async processERC20DepositsFromLogs(
    blockNumber: number,
    block: ethers.Block,
    walletAddresses: string[],
    users: Array<{ _id: any; walletAddress?: string }>
  ) {
    if (!this.provider || walletAddresses.length === 0) return;

    // Many BSC RPCs reject getLogs when topics[2] has >~4 addresses. Default 4; use 1 if still -32005.
    const chunkSize = Math.max(1, parseInt(process.env.DEPOSIT_GETLOGS_TOPICS_CHUNK || "4", 10));

    try {
      const toTopics = walletAddresses.map((w) => ethers.zeroPadValue(w, 32));
      const allLogs: ethers.Log[] = [];

      for (let i = 0; i < toTopics.length; i += chunkSize) {
        const chunk = toTopics.slice(i, i + chunkSize);
        let chunkLogs: ethers.Log[];

        try {
          chunkLogs = await this.retryWithBackoff(async () =>
            this.provider!.getLogs({
              fromBlock: blockNumber,
              toBlock: blockNumber,
              topics: [ERC20_TRANSFER_TOPIC, null, chunk],
            })
          );
        } catch (err: any) {
          // -32005 "limit exceeded": RPC rejects this topic count. Fallback: 1 getLogs per topic.
          if (err?.error?.code === -32005 || err?.error?.message === "limit exceeded" || err?.message?.includes("limit exceeded")) {
            chunkLogs = [];
            for (const t of chunk) {
              try {
                const one = await this.retryWithBackoff(() =>
                  this.provider!.getLogs({
                    fromBlock: blockNumber,
                    toBlock: blockNumber,
                    topics: [ERC20_TRANSFER_TOPIC, null, [t]],
                  })
                );
                chunkLogs.push(...one);
              } catch (_) { /* skip on failure */ }
              await this.delay(120);
            }
          } else {
            throw err;
          }
        }

        allLogs.push(...chunkLogs);
        if (i + chunkSize < toTopics.length) {
          await this.delay(100);
        }
      }

      // Dedupe by (transactionHash, logIndex, address) in case of overlap
      const seen = new Set<string>();
      const logs = allLogs.filter((l) => {
        const key = `${(l as { transactionHash?: string }).transactionHash}-${(l as { logIndex?: number }).logIndex}-${l.address}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const receiptCache = new Map<string, ethers.TransactionReceipt | null>();

      for (const log of logs) {
        try {
          const iface = new ethers.Interface([
            "event Transfer(address indexed from, address indexed to, uint256 value)",
          ]);
          const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
          if (!parsed) continue;

          const from = parsed.args[0].toLowerCase();
          const to = parsed.args[1].toLowerCase();
          const value = parsed.args[2];

          if (from === to) continue;
          if (!walletAddresses.includes(to)) continue;

          const user = users.find((u) => u.walletAddress?.toLowerCase() === to);
          if (!user) continue;

          const txHash = (log as { transactionHash?: string }).transactionHash;
          if (!txHash) continue;

          const existing = await Transaction.findOne({
            transactionHash: txHash.toLowerCase(),
            tokenAddress: log.address.toLowerCase(),
          });
          if (existing) {
            if (existing.status === "pending") {
              await updateTransactionStatus(txHash, "confirmed", {
                blockNumber: block.number,
                blockHash: block.hash,
                transactionTimestamp: new Date(Number(block.timestamp) * 1000),
                confirmations: 1,
              });
            }
            continue;
          }

          let rec = receiptCache.get(txHash);
          if (rec === undefined) {
            rec = await this.retryWithBackoff(async () => this.provider!.getTransactionReceipt(txHash));
            receiptCache.set(txHash, rec);
          }
          const receipt = rec;
          if (!receipt || !receipt.logs) continue;

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
          } catch {
            // ignore
          }

          const amount = ethers.formatUnits(value, decimals);
          const gasFee = receipt
            ? ethers.formatEther((receipt.gasUsed * (receipt.gasPrice || BigInt(0))).toString())
            : "0";

          await createTransaction({
            userId: user._id.toString(),
            walletAddress: to,
            chain: this.config.chain,
            type: "deposit",
            transactionHash: txHash,
            blockNumber: block.number,
            blockHash: block.hash,
            from,
            to,
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

          console.log(`Logged token deposit: ${tokenSymbol} (${amount}) to ${to} - ${txHash}`);
        } catch (e) {
          console.error("Error processing ERC20 log:", e);
        }
      }
    } catch (error) {
      console.error("Error in processERC20DepositsFromLogs:", error);
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

