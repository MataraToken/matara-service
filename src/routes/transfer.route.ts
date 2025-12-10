import { Router } from "express";
import {
  sendTokensToUser,
  sendTokensToExternal,
  verifyUsername,
} from "../controllers/transfer.controller";
// import { isAdmin } from "../middleware/admin";

const router = Router();

// Verify and load user by username
router.get("/verify-username", verifyUsername);

// Admin-only routes for sending tokens
router.post("/user", sendTokensToUser);
router.post("/external", sendTokensToExternal);

export default router;

