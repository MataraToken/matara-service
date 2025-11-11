import { Request, Response } from "express";
import {
  getUserTransactions,
  getTransactionByHash,
  getTransactionsByWallet,
  getUserTransactionStats,
} from "../services/transaction.service";
import {
  backfillSwapTransactions,
  backfillWalletTransactions,
  backfillAllUserTransactions,
} from "../services/transactionBackfill.service";
import User from "../model/user.model";
import { isAdmin } from "../middleware/admin";

export const getUserTransactionsController = async (req: Request, res: Response) => {
  try {
    const { username } = req.query;
    const { type, status, limit, page, chain } = req.query;

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const result = await getUserTransactions(user._id.toString(), {
      type: type as string,
      status: status as string,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
      chain: chain as string,
    });

    return res.status(200).json({
      data: result.transactions,
      pagination: result.pagination,
      message: "Transactions fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching user transactions:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getTransactionByHashController = async (req: Request, res: Response) => {
  try {
    const { transactionHash } = req.params;

    if (!transactionHash) {
      return res.status(400).json({ message: "Transaction hash is required" });
    }

    const transaction = await getTransactionByHash(transactionHash);

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    return res.status(200).json({
      data: transaction,
      message: "Transaction fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching transaction:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getTransactionsByWalletController = async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    const { type, status, limit, page } = req.query;

    if (!walletAddress) {
      return res.status(400).json({ message: "Wallet address is required" });
    }

    const result = await getTransactionsByWallet(walletAddress, {
      type: type as string,
      status: status as string,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    });

    return res.status(200).json({
      data: result.transactions,
      pagination: result.pagination,
      message: "Transactions fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching transactions by wallet:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserTransactionStatsController = async (req: Request, res: Response) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const stats = await getUserTransactionStats(user._id.toString());

    return res.status(200).json({
      data: stats,
      message: "Transaction statistics fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching transaction stats:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Admin endpoints for backfilling
export const backfillSwapTransactionsController = async (req: Request, res: Response) => {
  try {
    const result = await backfillSwapTransactions();
    return res.status(200).json({
      message: "Swap transactions backfilled successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error backfilling swap transactions:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const backfillWalletTransactionsController = async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    const { startBlock, endBlock, maxTransactions } = req.query;

    if (!walletAddress) {
      return res.status(400).json({ message: "Wallet address is required" });
    }

    const result = await backfillWalletTransactions(walletAddress, {
      startBlock: startBlock ? Number(startBlock) : undefined,
      endBlock: endBlock ? Number(endBlock) : undefined,
      maxTransactions: maxTransactions ? Number(maxTransactions) : undefined,
    });

    return res.status(200).json({
      message: "Wallet transactions backfilled successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error backfilling wallet transactions:", error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const backfillAllUserTransactionsController = async (req: Request, res: Response) => {
  try {
    const { startBlock, endBlock, maxTransactionsPerUser } = req.query;

    const result = await backfillAllUserTransactions({
      startBlock: startBlock ? Number(startBlock) : undefined,
      endBlock: endBlock ? Number(endBlock) : undefined,
      maxTransactionsPerUser: maxTransactionsPerUser
        ? Number(maxTransactionsPerUser)
        : undefined,
    });

    return res.status(200).json({
      message: "All user transactions backfilled successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error backfilling all user transactions:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
