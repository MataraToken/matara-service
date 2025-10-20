import { Router } from "express";
import { checkPasswordStatus, createPassword, loginUser, verifyToken } from "../controllers/auth.controller";

const router = Router();

// Check password status (GET with query parameter)
router.get("/check-password", checkPasswordStatus);

// Create password for user
router.post("/create-password", createPassword);

// Login with username and password
router.post("/login", loginUser);

// Verify JWT token
router.get("/verify-token", verifyToken);

export default router;
