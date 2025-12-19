import { Router } from "express";
import { 
  createTask, 
  deleteTask, 
  getTasks, 
  getUsers, 
  loginAdmin, 
  registerAdmin, 
  updateTask,
  getTaskSubmissionsForReview,
  reviewTaskSubmission,
} from "../controllers/admin.controller";
import { isAdmin } from "../middleware/admin";
import { taskValidator, validate } from "../middleware";
import upload from "../middleware/upload";
import { getTasksByProjectId } from "../controllers/task.controller";
import { adminIPWhitelist, authRateLimiter } from "../middleware/security";
import { getAdminIPWhitelist } from "../utils/env-validator";

const router = Router();

// Get admin IP whitelist
const adminIPs = getAdminIPWhitelist();

// Admin authentication routes (rate limited)
router.post("/register", authRateLimiter, registerAdmin);
router.post("/login", authRateLimiter, loginAdmin);

// Admin operations (require authentication, admin privileges, and optionally IP whitelist)
router.post("/tasks", isAdmin, adminIPWhitelist(adminIPs), validate, upload.single("icon"), createTask);

router.get("/users", isAdmin, adminIPWhitelist(adminIPs), getUsers);
router.get("/project/:projectId/tasks", isAdmin, adminIPWhitelist(adminIPs), getTasksByProjectId);
router.delete("/tasks/:slug", isAdmin, adminIPWhitelist(adminIPs), deleteTask);
router.put("/tasks/:slug", isAdmin, adminIPWhitelist(adminIPs), upload.single("icon"), updateTask);

// Task submission review routes
router.get("/task-submissions", isAdmin, adminIPWhitelist(adminIPs), getTaskSubmissionsForReview);
router.post("/task-submissions/:submissionId/review", isAdmin, adminIPWhitelist(adminIPs), reviewTaskSubmission);

export default router;
