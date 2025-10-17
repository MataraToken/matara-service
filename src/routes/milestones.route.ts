const router = require("express").Router();
import { completeMilestone, createMilestone, getUserMileStones } from "../controllers/milestones.controller";

router.post("/",  createMilestone);
router.get("/:username", getUserMileStones);
// router.get("/:slug", getTask);
// router.patch("/:slug", upload.single("icon"), updateTask);
router.post("/complete", completeMilestone);

export default router;