import { Router } from "express";
import { checkPasswordStatus, createPassword, loginUser, verifyToken } from "../controllers/auth.controller";
import { authRateLimiter, validateUsername } from "../middleware/security";

const router = Router();

// Check password status (GET with query parameter)
router.get("/check-password", checkPasswordStatus);

// Create password for user (rate limited)
router.post("/create-password", authRateLimiter, validateUsername, createPassword);

// Login with username and password (rate limited)
router.post("/login", authRateLimiter, validateUsername, loginUser);

// Verify JWT token
router.get("/verify-token", verifyToken);

export default router;
