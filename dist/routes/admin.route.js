"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const admin_1 = require("../middleware/admin");
const middleware_1 = require("../middleware");
const upload_1 = __importDefault(require("../middleware/upload"));
const router = (0, express_1.Router)();
router.post("/register", admin_controller_1.registerAdmin);
router.post("/login", admin_controller_1.loginAdmin);
router.post("/tasks", admin_1.isAdmin, middleware_1.taskValidator, upload_1.default.single("icon"), admin_controller_1.createTask);
router.get("/users", admin_1.isAdmin, admin_controller_1.getUsers);
router.get("/tasks", admin_1.isAdmin, admin_controller_1.getTasks);
router.delete("/tasks/:slug", admin_1.isAdmin, admin_controller_1.deleteTask);
exports.default = router;
//# sourceMappingURL=admin.route.js.map