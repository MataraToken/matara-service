const router = require("express").Router();
import { createBoost, getBoosts, purchaseBoost } from "../controllers/boosts.controller";

router.post("/",  createBoost);
router.get("/:username", getBoosts);
// router.get("/:slug", getTask);
// router.patch("/:slug", upload.single("icon"), updateTask);
router.post("/purchase", purchaseBoost);

export default router;