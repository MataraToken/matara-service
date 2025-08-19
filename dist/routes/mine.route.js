"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const router = require("express").Router();
const mine_controller_1 = require("../controllers/mine.controller");
router.post("/start", mine_controller_1.startMining);
router.post("/claim", mine_controller_1.claimMining);
router.get("/state", mine_controller_1.miningState);
exports.default = router;
//# sourceMappingURL=mine.route.js.map