import { ethers } from "ethers";
import Transaction from "../model/transaction.model";
import SwapRequest from "../model/swapRequest.model";
import User from "../model/user.model";
import { createTransaction } from "./transaction.service";

/**
 * Backfill transaction records from existing swap requests
 */
export async function backfillSwapTransactions() {
  try {
    console.log("Starting swap transaction backfill...");
    
    // Find all completed swap requests without transaction records
    const swapRequests = await SwapRequest.find({
      status: "completed",
      transactionHash: { $exists: true, $ne: null },
    }).lean();

    console.log(`Found ${swapRequests.length} completed swap requests to backfill`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const swap of swapRequests) {
      try {
        // Check if transaction already exists
        const existing = await Transaction.findOne({
          transactionHash: swap.transactionHash.toLowerCase(),
        });

        if (existing) {
          skippedCount++;
          continue;
        }

        // Get user info
        const user = await User.findById(swap.userId).lean();
        if (!user) {
          console.warn(`User not found for swap ${swap._id}`);
          errorCount++;
          continue;
        }

        // Get transaction details from blockchain
        const provider = new ethers.JsonRpcProvider(
          process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org/"
        );

        let receipt;
        try {
          receipt = await provider.getTransactionReceipt(swap.transactionHash);
        } catch (txError) {
          console.warn(`Could not fetch receipt for ${swap.transactionHash}:`, txError);
          // Continue without receipt data
        }

        const gasFee = receipt
          ? ethers.formatEther(
              (receipt.gasUsed * (receipt.gasPrice || BigInt(0))).toString()
            )
          : "0";

        // Create transaction record
        await createTransaction({
          userId: swap.userId.toString(),
          walletAddress: swap.walletAddress,
          chain: swap.chain || "BSC",
          type: "swap",
          transactionHash: swap.transactionHash,
          blockNumber: receipt?.blockNumber,
          blockHash: receipt?.blockHash,
          from: swap.walletAddress,
          tokenIn: swap.tokenIn,
          tokenOut: swap.tokenOut,
          tokenInSymbol: swap.tokenInSymbol,
          tokenOutSymbol: swap.tokenOutSymbol,
          amountIn: swap.amountIn,
          amountOut: swap.amountOut || "",
          gasUsed: receipt?.gasUsed.toString(),
          gasPrice: receipt?.gasPrice?.toString(),
          gasFee,
          status: "confirmed",
          confirmations: receipt ? 1 : 0,
          transactionTimestamp: swap.completedAt || swap.createdAt,
          confirmedAt: swap.completedAt,
          swapRequestId: swap._id.toString(),
        });

        successCount++;
        console.log(`Backfilled transaction for swap ${swap._id}`);
      } catch (error) {
        console.error(`Error backfilling swap ${swap._id}:`, error);
        errorCount++;
      }
    }

    console.log(`Backfill complete: ${successCount} created, ${skippedCount} skipped, ${errorCount} errors`);
    return { successCount, skippedCount, errorCount };
  } catch (error) {
    console.error("Error in swap transaction backfill:", error);
    throw error;
  }
}

/**
 * Backfill transactions from blockchain for a specific wallet address
 */
export async function backfillWalletTransactions(
  walletAddress: string,
  options?: {
    startBlock?: number;
    endBlock?: number;
    maxTransactions?: number;
  }
) {
  try {
    console.log(`Starting wallet transaction backfill for ${walletAddress}...`);

    const provider = new ethers.JsonRpcProvider(
      process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org/"
    );

    // Normalize wallet address - handle both checksummed and lowercase
    const walletWithPrefix = walletAddress.startsWith('0x') 
      ? walletAddress 
      : `0x${walletAddress}`;
    const walletLower = walletWithPrefix.toLowerCase();
    
    // Find user by wallet address (try multiple formats)
    // First try exact match (for checksummed addresses)
    let user = await User.findOne({
      walletAddress: walletWithPrefix,
    }).lean();

    // If not found, try lowercase
    if (!user) {
      user = await User.findOne({
        walletAddress: walletLower,
      }).lean();
    }

    // If still not found, try case-insensitive regex search
    if (!user) {
      const walletWithoutPrefix = walletLower.replace('0x', '');
      user = await User.findOne({
        walletAddress: { $regex: new RegExp(`^0x${walletWithoutPrefix}$`, 'i') },
      }).lean();
    }

    if (!user) {
      // Debug: Show what wallet addresses exist in database
      const allUsers = await User.find({
        walletAddress: { $exists: true, $ne: null },
      })
        .select('username walletAddress')
        .limit(10)
        .lean();
      
      console.error(`\n❌ User not found for wallet address: ${walletAddress}`);
      console.error(`   Searched formats: ${walletWithPrefix}, ${walletLower}, case-insensitive`);
      console.error(`\n📋 Sample wallet addresses in database (first 10):`);
      allUsers.forEach((u, i) => {
        console.error(`   ${i + 1}. ${u.walletAddress} (user: ${u.username || u._id})`);
      });
      
      // Check if any wallet is similar (first 10 chars match)
      const searchPrefix = walletLower.slice(0, 10);
      const similar = allUsers.find(u => 
        u.walletAddress && u.walletAddress.toLowerCase().startsWith(searchPrefix)
      );
      if (similar) {
        console.error(`\n💡 Found similar wallet: ${similar.walletAddress} (user: ${similar.username})`);
        console.error(`   Did you mean: ${similar.walletAddress}?`);
      }
      
      // Check if wallet exists in database with different case
      const exactMatchLower = allUsers.find(u => 
        u.walletAddress && u.walletAddress.toLowerCase() === walletLower
      );
      if (exactMatchLower) {
        console.error(`\n💡 Found wallet with different case: ${exactMatchLower.walletAddress}`);
        console.error(`   Use this exact format: ${exactMatchLower.walletAddress}`);
      }
      
      throw new Error(
        `User not found for wallet address ${walletAddress}.\n` +
        `This wallet address is not associated with any user in the database.\n` +
        `Please ensure the wallet address is correct or create a user account first.`
      );
    }
    
    console.log(`✅ Found user: ${user.username || user._id} for wallet ${user.walletAddress}`);

    const currentBlock = await provider.getBlockNumber();
    const startBlock = options?.startBlock || currentBlock - 10000; // Default: last 10k blocks
    const endBlock = options?.endBlock || currentBlock;
    const maxTransactions = options?.maxTransactions || 1000;

    console.log(`Scanning blocks ${startBlock} to ${endBlock}`);

    let processedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Scan blocks in batches
    const batchSize = 100;
    for (let blockNum = startBlock; blockNum <= endBlock && processedCount < maxTransactions; blockNum += batchSize) {
      const endBatch = Math.min(blockNum + batchSize - 1, endBlock);

      try {
        // Process batch of blocks
        for (let b = blockNum; b <= endBatch && processedCount < maxTransactions; b++) {
          try {
            const block = await provider.getBlock(b, true);
            if (!block || !block.transactions) continue;

            for (const txHash of block.transactions) {
              if (typeof txHash !== "string") continue;
              if (processedCount >= maxTransactions) break;

              try {
                const tx = await provider.getTransaction(txHash);
                if (!tx) continue;

                const toAddress = tx.to?.toLowerCase();
                const fromAddress = tx.from?.toLowerCase();
                const walletLower = walletAddress.toLowerCase();

                // Check if transaction involves this wallet
                if (toAddress !== walletLower && fromAddress !== walletLower) {
                  continue;
                }

                processedCount++;

                // Check if transaction already exists
                const existing = await Transaction.findOne({
                  transactionHash: tx.hash.toLowerCase(),
                });

                if (existing) {
                  skippedCount++;
                  continue;
                }

                // Determine transaction type
                let txType: "deposit" | "withdrawal" | "transfer" | "other" = "other";
                if (toAddress === walletLower && tx.value && tx.value > BigInt(0)) {
                  txType = "deposit";
                } else if (fromAddress === walletLower && tx.value && tx.value > BigInt(0)) {
                  txType = "withdrawal";
                } else if (toAddress === walletLower || fromAddress === walletLower) {
                  txType = "transfer";
                }

                // Get receipt
                let receipt;
                try {
                  receipt = await provider.getTransactionReceipt(tx.hash);
                } catch (receiptError) {
                  // Continue without receipt
                }

                const gasFee = receipt
                  ? ethers.formatEther(
                      (receipt.gasUsed * (receipt.gasPrice || BigInt(0))).toString()
                    )
                  : "0";

                // Create transaction record
                await createTransaction({
                  userId: user._id.toString(),
                  walletAddress: walletAddress.toLowerCase(),
                  chain: "BSC",
                  type: txType,
                  transactionHash: tx.hash,
                  blockNumber: receipt?.blockNumber || block.number,
                  blockHash: receipt?.blockHash || block.hash,
                  from: tx.from?.toLowerCase(),
                  to: tx.to?.toLowerCase(),
                  tokenAddress: ethers.ZeroAddress, // Native BNB
                  tokenSymbol: "BNB",
                  amount: tx.value ? ethers.formatEther(tx.value) : "0",
                  amountFormatted: tx.value ? ethers.formatEther(tx.value) : "0",
                  gasUsed: receipt?.gasUsed.toString(),
                  gasPrice: receipt?.gasPrice?.toString(),
                  gasFee,
                  status: receipt ? "confirmed" : "pending",
                  confirmations: receipt ? currentBlock - (receipt.blockNumber || 0) : 0,
                  transactionTimestamp: new Date(Number(block.timestamp) * 1000),
                  confirmedAt: receipt ? new Date() : undefined,
                });

                createdCount++;
              } catch (txError) {
                errorCount++;
                console.warn(`Error processing transaction ${txHash}:`, txError);
              }
            }
          } catch (blockError) {
            console.warn(`Error processing block ${b}:`, blockError);
          }
        }

        // Add delay between batches to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (batchError) {
        console.error(`Error processing batch ${blockNum}-${endBatch}:`, batchError);
      }
    }

    console.log(
      `Wallet backfill complete: ${createdCount} created, ${skippedCount} skipped, ${errorCount} errors`
    );
    return { createdCount, skippedCount, errorCount, processedCount };
  } catch (error) {
    console.error("Error in wallet transaction backfill:", error);
    throw error;
  }
}

/**
 * Backfill transactions for all users
 */
export async function backfillAllUserTransactions(options?: {
  startBlock?: number;
  endBlock?: number;
  maxTransactionsPerUser?: number;
}) {
  try {
    console.log("Starting backfill for all users...");

    const users = await User.find({
      walletAddress: { $exists: true, $ne: null },
    })
      .select("_id walletAddress")
      .lean();

    console.log(`Found ${users.length} users with wallet addresses`);

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const user of users) {
      if (!user.walletAddress) continue;

      try {
        console.log(`Backfilling transactions for user ${user._id} (${user.walletAddress})`);
        const result = await backfillWalletTransactions(user.walletAddress, {
          startBlock: options?.startBlock,
          endBlock: options?.endBlock,
          maxTransactions: options?.maxTransactionsPerUser || 100,
        });

        totalCreated += result.createdCount;
        totalSkipped += result.skippedCount;
        totalErrors += result.errorCount;

        // Add delay between users to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error backfilling for user ${user._id}:`, error);
        totalErrors++;
      }
    }

    console.log(
      `All users backfill complete: ${totalCreated} created, ${totalSkipped} skipped, ${totalErrors} errors`
    );
    return { totalCreated, totalSkipped, totalErrors };
  } catch (error) {
    console.error("Error in all users transaction backfill:", error);
    throw error;
  }
}

