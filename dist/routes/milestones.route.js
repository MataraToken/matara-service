"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const router = require("express").Router();
const milestones_controller_1 = require("../controllers/milestones.controller");
router.post("/", milestones_controller_1.createMilestone);
router.get("/:username", milestones_controller_1.getUserMileStones);
// router.get("/:slug", getTask);
// router.patch("/:slug", upload.single("icon"), updateTask);
router.post("/complete", milestones_controller_1.completeMilestone);
exports.default = router;
//# sourceMappingURL=milestones.route.js.map