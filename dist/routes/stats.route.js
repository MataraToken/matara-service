"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const router = require("express").Router();
const stats_controller_1 = require("../controllers/stats.controller");
router.get("/summary", stats_controller_1.getSummary);
router.get("/leaderboard", stats_controller_1.getLeaderboard);
exports.default = router;
//# sourceMappingURL=stats.route.js.map