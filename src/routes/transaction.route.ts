import { Router } from "express";
import {
  getUserTransactionsController,
  getTransactionByHashController,
  getTransactionsByWalletController,
  getUserTransactionStatsController,
  backfillSwapTransactionsController,
  backfillWalletTransactionsController,
  backfillAllUserTransactionsController,
} from "../controllers/transaction.controller";
import { isAdmin } from "../middleware/admin";

const router = Router();

// User routes
router.get("/user", getUserTransactionsController);
router.get("/user/stats", getUserTransactionStatsController);
router.get("/hash/:transactionHash", getTransactionByHashController);
router.get("/wallet/:walletAddress", getTransactionsByWalletController);

// Admin routes for backfilling historical transactions
router.post("/admin/backfill/swaps", isAdmin, backfillSwapTransactionsController);
router.post("/admin/backfill/wallet/:walletAddress", isAdmin, backfillWalletTransactionsController);
router.post("/admin/backfill/all", isAdmin, backfillAllUserTransactionsController);

export default router;

