import { Request, Response, NextFunction } from "express";
import { getTransactionLimits } from "../utils/env-validator";
import { logSuspiciousActivity } from "../services/audit.service";

// In-memory store for tracking transactions (in production, use Redis)
interface TransactionRecord {
  userId: string;
  date: string;
  count: number;
  totalAmount: number;
}

const transactionStore = new Map<string, TransactionRecord>();

/**
 * Clean up old transaction records (older than 24 hours)
 */
const cleanupOldRecords = () => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  // Convert Map entries to array for iteration
  const entries = Array.from(transactionStore.entries());
  for (const [key, record] of entries) {
    if (record.date < yesterdayStr) {
      transactionStore.delete(key);
    }
  }
};

// Clean up every hour
setInterval(cleanupOldRecords, 60 * 60 * 1000);

/**
 * Get or create transaction record for user
 */
const getTransactionRecord = (userId: string): TransactionRecord => {
  const today = new Date().toISOString().split("T")[0];
  const key = `${userId}:${today}`;

  if (!transactionStore.has(key)) {
    transactionStore.set(key, {
      userId,
      date: today,
      count: 0,
      totalAmount: 0,
    });
  }

  return transactionStore.get(key)!;
}

/**
 * Middleware to check transaction limits
 */
export const checkTransactionLimits = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const limits = getTransactionLimits();
  const userId = (req.user as any)?.id;

  if (!userId) {
    return next(); // Skip if no user (will be handled by auth middleware)
  }

  const record = getTransactionRecord(userId);
  const amount = parseFloat(req.body.amount || "0");

  // Check daily transaction count limit
  if (record.count >= limits.maxTransactionsPerDay) {
    const clientIP =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "";

    logSuspiciousActivity("TRANSACTION_LIMIT_EXCEEDED", {
      userId,
      ipAddress: clientIP,
      details: {
        limit: limits.maxTransactionsPerDay,
        current: record.count,
      },
    });

    return res.status(429).json({
      status: false,
      message: `Daily transaction limit exceeded. Maximum ${limits.maxTransactionsPerDay} transactions per day.`,
    });
  }

  // Check per-transaction amount limit
  if (amount > limits.maxAmountPerTransaction) {
    const clientIP =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "";

    logSuspiciousActivity("TRANSACTION_AMOUNT_EXCEEDED", {
      userId,
      ipAddress: clientIP,
      details: {
        limit: limits.maxAmountPerTransaction,
        requested: amount,
      },
    });

    return res.status(400).json({
      status: false,
      message: `Transaction amount exceeds maximum allowed. Maximum ${limits.maxAmountPerTransaction} per transaction.`,
    });
  }

  // Check daily amount limit
  if (record.totalAmount + amount > limits.maxAmountPerDay) {
    const clientIP =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "";

    logSuspiciousActivity("DAILY_AMOUNT_LIMIT_EXCEEDED", {
      userId,
      ipAddress: clientIP,
      details: {
        limit: limits.maxAmountPerDay,
        current: record.totalAmount,
        requested: amount,
      },
    });

    return res.status(429).json({
      status: false,
      message: `Daily amount limit exceeded. Maximum ${limits.maxAmountPerDay} per day.`,
    });
  }

  // Update record (will be finalized after successful transaction)
  record.count += 1;
  record.totalAmount += amount;

  next();
};

