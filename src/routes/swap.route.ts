import { Router } from "express";
import {
  createSwapRequest,
  getUserSwapRequests,
  getSwapRequest,
  updateSwapRequestStatus,
  getAllSwapRequests,
  getSwapFeeStats,
} from "../controllers/swap.controller";
import { isAdmin } from "../middleware/admin";
import { authenticateToken } from "../middleware/auth";
import {
  swapRateLimiter,
  walletOperationRateLimiter,
  validateTokenAddress,
  validateAmount,
} from "../middleware/security";
import { checkTransactionLimits } from "../middleware/transaction-limits";

const router = Router();

// User routes (require authentication)
router.post(
  "/",
  authenticateToken,
  swapRateLimiter,
  validateTokenAddress,
  validateAmount,
  checkTransactionLimits,
  createSwapRequest
);

router.get("/user", authenticateToken, getUserSwapRequests);
router.get("/:swapRequestId", authenticateToken, getSwapRequest);

// Admin routes (require authentication and admin privileges)
router.get("/admin/all", authenticateToken, isAdmin, getAllSwapRequests);
router.patch(
  "/admin/:swapRequestId",
  authenticateToken,
  isAdmin,
  walletOperationRateLimiter,
  updateSwapRequestStatus
);
router.get("/admin/stats", authenticateToken, isAdmin, getSwapFeeStats);

export default router;

