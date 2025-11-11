/**
 * Script to backfill historical transactions
 * 
 * Usage:
 *   yarn build && node dist/scripts/backfill-transactions.js
 * 
 * Or with ts-node:
 *   ts-node scripts/backfill-transactions.ts
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { backfillSwapTransactions, backfillWalletTransactions, backfillAllUserTransactions } from "../src/services/transactionBackfill.service";

// Load environment variables
dotenv.config();

const backfillTransactions = async () => {
  try {
    // Connect to database
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGO_URL!);
    console.log("Database connected successfully");

    // Choose which backfill to run
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
      case "swaps":
        console.log("\n=== Backfilling Swap Transactions ===");
        const swapResult = await backfillSwapTransactions();
        console.log("\nSwap Backfill Results:", swapResult);
        break;

      case "wallet":
        const walletAddress = args[1];
        if (!walletAddress) {
          console.error("Error: Wallet address required for wallet backfill");
          console.log("Usage: yarn backfill wallet <walletAddress> [startBlock] [endBlock] [maxTransactions]");
          process.exit(1);
        }
        console.log(`\n=== Backfilling Wallet Transactions: ${walletAddress} ===`);
        const walletResult = await backfillWalletTransactions(walletAddress, {
          startBlock: args[2] ? parseInt(args[2]) : undefined,
          endBlock: args[3] ? parseInt(args[3]) : undefined,
          maxTransactions: args[4] ? parseInt(args[4]) : undefined,
        });
        console.log("\nWallet Backfill Results:", walletResult);
        break;

      case "all":
        console.log("\n=== Backfilling All User Transactions ===");
        console.log("Warning: This may take a long time and make many RPC calls");
        const allResult = await backfillAllUserTransactions({
          startBlock: args[1] ? parseInt(args[1]) : undefined,
          endBlock: args[2] ? parseInt(args[2]) : undefined,
          maxTransactionsPerUser: args[3] ? parseInt(args[3]) : undefined,
        });
        console.log("\nAll Users Backfill Results:", allResult);
        break;

      default:
        console.log("Transaction Backfill Script");
        console.log("\nUsage:");
        console.log("  yarn backfill swaps                    - Backfill swap transactions");
        console.log("  yarn backfill wallet <address>         - Backfill specific wallet");
        console.log("  yarn backfill wallet <address> <start> <end> <max> - Backfill with options");
        console.log("  yarn backfill all                      - Backfill all users (use with caution)");
        console.log("\nExamples:");
        console.log("  yarn backfill swaps");
        console.log("  yarn backfill wallet 0x1234...");
        console.log("  yarn backfill wallet 0x1234... 30000000 35000000 500");
        console.log("  yarn backfill all");
        process.exit(0);
    }

    console.log("\n✅ Backfill completed successfully");
  } catch (error) {
    console.error("❌ Backfill failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed");
    process.exit(0);
  }
};

// Run if executed directly
if (require.main === module) {
  backfillTransactions();
}

export default backfillTransactions;

