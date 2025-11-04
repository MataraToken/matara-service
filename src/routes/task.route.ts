const router = require("express").Router();
// import { taskValidator, validate } from "../middleware";
import { completeTask, getTask, getUserTasks, updateTask, getTasksByProjectId } from "../controllers/task.controller";
import upload from "../middleware/upload";

// router.post("/", taskValidator, upload.single("icon"), createTask);
router.get("/project/:projectId/tasks", getTasksByProjectId);
router.get("/:username",  getUserTasks);
router.get("/:slug", getTask);
router.patch("/:slug", upload.single("icon"), updateTask);
// router.delete("/:slug", deleteTask);
router.post("/:slug/complete", completeTask);

export default router;