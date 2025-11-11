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

const router = Router();

// User routes
router.post("/", createSwapRequest);
router.get("/user", getUserSwapRequests);
router.get("/:swapRequestId", getSwapRequest);

// Admin routes
router.get("/admin/all", isAdmin, getAllSwapRequests);
router.patch("/admin/:swapRequestId", isAdmin, updateSwapRequestStatus);
router.get("/admin/stats", isAdmin, getSwapFeeStats);

export default router;

