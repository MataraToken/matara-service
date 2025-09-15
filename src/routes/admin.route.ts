import { Router } from "express";
import { createTask, deleteTask, getTasks, getUsers } from "../controllers/admin.controller";
import { isAdmin } from "../middleware/admin";
import { taskValidator } from "../middleware";
import upload from "../middleware/upload";

const router = Router();

router.post("/tasks", isAdmin, taskValidator, upload.single("icon"), createTask);
router.get("/users", isAdmin, getUsers);
router.get("/tasks", isAdmin, getTasks);
router.delete("/tasks/:slug", isAdmin, deleteTask);

export default router;
