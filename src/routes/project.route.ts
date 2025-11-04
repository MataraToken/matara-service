import { Router } from "express";
import {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  joinProject,
} from "../controllers/project.controller";
import { isAdmin } from "../middleware/admin";
import { projectValidator, validate } from "../middleware";
import upload from "../middleware/upload";

const router = Router();

// Admin-only routes
router.post("/", isAdmin, projectValidator, validate, upload.single("logo"), createProject);
router.put("/:slug", isAdmin, upload.single("logo"), updateProject);
router.delete("/:slug", isAdmin, deleteProject);

// Public routes
router.get("/", getProjects);
router.get("/:slug", getProject);
router.post("/:slug/join", joinProject);

export default router;

