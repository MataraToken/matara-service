import { Router } from "express";
import { createTask, deleteTask, getTasks, getUsers, loginAdmin, registerAdmin, updateTask } from "../controllers/admin.controller";
import { isAdmin } from "../middleware/admin";
import { taskValidator, validate } from "../middleware";
import upload from "../middleware/upload";
import { getTasksByProjectId } from "../controllers/task.controller";

const router = Router();

router.post("/register", registerAdmin);
router.post("/login", loginAdmin);
router.post("/tasks", isAdmin, validate, upload.single("icon"), createTask);

router.get("/users", isAdmin, getUsers);
router.get("/project/:projectId/tasks", isAdmin, getTasksByProjectId);
router.delete("/tasks/:slug", isAdmin, deleteTask);
router.put("/tasks/:slug", isAdmin, upload.single("icon"), updateTask);


export default router;
