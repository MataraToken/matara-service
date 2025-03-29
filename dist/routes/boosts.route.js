"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const router = require("express").Router();
const boosts_controller_1 = require("../controllers/boosts.controller");
router.post("/", boosts_controller_1.createBoost);
router.get("/:username", boosts_controller_1.getBoosts);
// router.get("/:slug", getTask);
// router.patch("/:slug", upload.single("icon"), updateTask);
router.post("/purchase", boosts_controller_1.purchaseBoost);
exports.default = router;
//# sourceMappingURL=boosts.route.js.map