import Transaction from "../model/transaction.model";
import { ethers } from "ethers";
import User from "../model/user.model";

export interface CreateTransactionParams {
  userId: string;
  walletAddress: string;
  chain?: string;
  type: "deposit" | "withdrawal" | "swap" | "transfer" | "approval" | "other";
  transactionHash: string;
  blockNumber?: number;
  blockHash?: string;
  from?: string;
  to?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  amount?: string;
  amountFormatted?: string;
  tokenIn?: string;
  tokenOut?: string;
  tokenInSymbol?: string;
  tokenOutSymbol?: string;
  amountIn?: string;
  amountOut?: string;
  gasUsed?: string;
  gasPrice?: string;
  gasFee?: string;
  status?: "pending" | "confirmed" | "failed";
  confirmations?: number;
  transactionTimestamp?: Date;
  confirmedAt?: Date;
  metadata?: any;
  swapRequestId?: string;
}

/**
 * Create a new transaction record
 */
export async function createTransaction(params: CreateTransactionParams) {
    try {
      // Check if transaction already exists (use transactionHash + tokenAddress for deposits to allow multiple tokens per tx)
    const findQuery: Record<string, string> = { transactionHash: params.transactionHash.toLowerCase() };
    if (params.tokenAddress != null && params.tokenAddress !== "") {
      findQuery.tokenAddress = params.tokenAddress.toLowerCase();
    }
    const existing = await Transaction.findOne(findQuery);

    if (existing) {
      return existing; // Return existing transaction
    }

    const transaction = new Transaction({
      ...params,
      transactionHash: params.transactionHash.toLowerCase(),
      walletAddress: params.walletAddress.toLowerCase(),
      chain: params.chain || "BSC",
      status: params.status || "pending",
    });

    await transaction.save();
    return transaction;
  } catch (error) {
    console.error("Error creating transaction:", error);
    throw error;
  }
}

/**
 * Get all transactions for a user
 */
export async function getUserTransactions(
  userId: string,
  options?: {
    type?: string;
    status?: string;
    limit?: number;
    page?: number;
    chain?: string;
  }
) {
  try {
    const query: any = { userId };
    
    if (options?.type) {
      query.type = options.type;
    }
    if (options?.status) {
      query.status = options.status;
    }
    if (options?.chain) {
      query.chain = options.chain;
    }

    const limit = options?.limit || 50;
    const page = options?.page || 1;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await Transaction.countDocuments(query);

    return {
      transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error("Error getting user transactions:", error);
    throw error;
  }
}

/**
 * Get transaction by hash
 */
export async function getTransactionByHash(transactionHash: string) {
  try {
    return await Transaction.findOne({
      transactionHash: transactionHash.toLowerCase(),
    }).lean();
  } catch (error) {
    console.error("Error getting transaction by hash:", error);
    throw error;
  }
}

/**
 * Get transactions by wallet address
 */
export async function getTransactionsByWallet(
  walletAddress: string,
  options?: {
    type?: string;
    status?: string;
    limit?: number;
    page?: number;
  }
) {
  try {
    const query: any = { walletAddress: walletAddress.toLowerCase() };
    
    if (options?.type) {
      query.type = options.type;
    }
    if (options?.status) {
      query.status = options.status;
    }

    const limit = options?.limit || 50;
    const page = options?.page || 1;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find(query)
      .populate("userId", "username")
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await Transaction.countDocuments(query);

    return {
      transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error("Error getting transactions by wallet:", error);
    throw error;
  }
}

/**
 * Update transaction status
 */
export async function updateTransactionStatus(
  transactionHash: string,
  status: "pending" | "confirmed" | "failed",
  updates?: {
    confirmations?: number;
    blockNumber?: number;
    blockHash?: string;
    gasUsed?: string;
    gasPrice?: string;
    gasFee?: string;
    confirmedAt?: Date;
    transactionTimestamp?: Date;
  }
) {
  try {
    const updateData: any = { status };
    
    if (updates) {
      if (updates.confirmations !== undefined) updateData.confirmations = updates.confirmations;
      if (updates.blockNumber) updateData.blockNumber = updates.blockNumber;
      if (updates.blockHash) updateData.blockHash = updates.blockHash;
      if (updates.gasUsed) updateData.gasUsed = updates.gasUsed;
      if (updates.gasPrice) updateData.gasPrice = updates.gasPrice;
      if (updates.gasFee) updateData.gasFee = updates.gasFee;
      if (updates.confirmedAt) updateData.confirmedAt = updates.confirmedAt;
      if (updates.transactionTimestamp) updateData.transactionTimestamp = updates.transactionTimestamp;
    }

    if (status === "confirmed" && !updateData.confirmedAt) {
      updateData.confirmedAt = new Date();
    }

    return await Transaction.findOneAndUpdate(
      { transactionHash: transactionHash.toLowerCase() },
      updateData,
      { new: true }
    );
  } catch (error) {
    console.error("Error updating transaction status:", error);
    throw error;
  }
}

/**
 * Get transaction statistics for a user
 */
export async function getUserTransactionStats(userId: string) {
  try {
    const [
      totalTransactions,
      deposits,
      withdrawals,
      swaps,
      pending,
      confirmed,
      failed,
    ] = await Promise.all([
      Transaction.countDocuments({ userId }),
      Transaction.countDocuments({ userId, type: "deposit" }),
      Transaction.countDocuments({ userId, type: "withdrawal" }),
      Transaction.countDocuments({ userId, type: "swap" }),
      Transaction.countDocuments({ userId, status: "pending" }),
      Transaction.countDocuments({ userId, status: "confirmed" }),
      Transaction.countDocuments({ userId, status: "failed" }),
    ]);

    // Calculate total deposit amount
    const depositTransactions = await Transaction.find({
      userId,
      type: "deposit",
      status: "confirmed",
    }).lean();

    let totalDeposits = 0;
    depositTransactions.forEach((tx) => {
      const amount = parseFloat(tx.amount || "0");
      totalDeposits += amount;
    });

    return {
      totalTransactions,
      byType: {
        deposits,
        withdrawals,
        swaps,
      },
      byStatus: {
        pending,
        confirmed,
        failed,
      },
      totalDeposits: totalDeposits.toFixed(18),
    };
  } catch (error) {
    console.error("Error getting transaction stats:", error);
    throw error;
  }
}

