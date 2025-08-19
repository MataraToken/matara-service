"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const router = require("express").Router();
const bonus_controller_1 = require("../controllers/bonus.controller");
router.get("/check/:username", bonus_controller_1.checkBonusStatus);
// router.get("/:slug", getTask);
// router.patch("/:slug", upload.single("icon"), updateTask);
router.post("/collect", bonus_controller_1.collectBonus);
exports.default = router;
//# sourceMappingURL=bonus.route.js.map