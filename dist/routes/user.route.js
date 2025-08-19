"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const router = require("express").Router();
const point_controller_1 = require("../controllers/point.controller");
const user_controller_1 = require("../controllers/user.controller");
router.post("/register", user_controller_1.registerUser);
router.get("/get-user", user_controller_1.getUser);
router.get("/referrals", user_controller_1.getReferredUsers);
router.get("/leaderboard", point_controller_1.getLeaderBoard);
router.post("/onboard", user_controller_1.saveOnboarding);
router.get("/points", point_controller_1.getUserPoint);
router.get("/ranking", user_controller_1.userRanking);
exports.default = router;
//# sourceMappingURL=user.route.js.map