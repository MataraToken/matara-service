"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const router = require("express").Router();
const middleware_1 = require("../middleware");
const task_controller_1 = require("../controllers/task.controller");
const upload_1 = __importDefault(require("../middleware/upload"));
router.post("/", middleware_1.taskValidator, upload_1.default.single("icon"), task_controller_1.createTask);
router.get("/:username", task_controller_1.getUserTasks);
router.get("/:slug", task_controller_1.getTask);
router.patch("/:slug", upload_1.default.single("icon"), task_controller_1.updateTask);
router.post("/:slug/complete", task_controller_1.completeTask);
exports.default = router;
//# sourceMappingURL=task.route.js.map