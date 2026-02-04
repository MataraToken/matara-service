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
  validateTokenIn,
  validateTokenOut,
  validateAmountIn,
  requestTimeout,
} from "../middleware/security";
import { checkTransactionLimits } from "../middleware/transaction-limits";

const router = Router();

// User routes (require authentication)
// Swap operations can take longer due to blockchain transactions, so use a longer timeout (2 minutes)
router.post(
  "/",
  authenticateToken,
  swapRateLimiter,
  validateTokenIn,
  validateTokenOut,
  validateAmountIn,
  checkTransactionLimits,
  requestTimeout(120000), // 2 minutes for swap execution
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

