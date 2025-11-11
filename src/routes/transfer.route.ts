import { Router } from "express";
import {
  sendTokensToUser,
  sendTokensToExternal,
} from "../controllers/transfer.controller";
import { isAdmin } from "../middleware/admin";

const router = Router();

// Admin-only routes for sending tokens
router.post("/user", isAdmin, sendTokensToUser);
router.post("/external", isAdmin, sendTokensToExternal);

export default router;

