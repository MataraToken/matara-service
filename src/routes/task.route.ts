const router = require("express").Router();
import { taskValidator, validate } from "../middleware";
import { completeTask, createTask, getTask, getUserTasks, updateTask } from "../controllers/task.controller";
import upload from "../middleware/upload";

router.post("/", taskValidator, upload.single("icon"), createTask);
router.get("/:username",  getUserTasks);
router.get("/:slug", getTask);
router.patch("/:slug", upload.single("icon"), updateTask);
router.post("/:slug/complete", completeTask);

export default router;