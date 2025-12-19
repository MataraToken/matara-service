import { Router } from "express";
import {
  sendTokensToUser,
  sendTokensToExternal,
  verifyUsername,
} from "../controllers/transfer.controller";
import { authenticateToken } from "../middleware/auth";
import {
  transferRateLimiter,
  validateTokenAddress,
  validateAmount,
  validateWalletAddress,
} from "../middleware/security";
import { checkTransactionLimits } from "../middleware/transaction-limits";

const router = Router();

// Verify and load user by username (public, but rate limited)
router.get("/verify-username", verifyUsername);

// User routes for sending tokens (require authentication)
router.post(
  "/user",
  authenticateToken,
  transferRateLimiter,
  validateTokenAddress,
  validateAmount,
  checkTransactionLimits,
  sendTokensToUser
);

router.post(
  "/external",
  authenticateToken,
  transferRateLimiter,
  validateTokenAddress,
  validateAmount,
  validateWalletAddress,
  checkTransactionLimits,
  sendTokensToExternal
);

export default router;

