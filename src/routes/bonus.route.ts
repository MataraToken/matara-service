const router = require("express").Router();
import { checkBonusStatus, collectBonus } from "../controllers/bonus.controller";

router.get("/check/:username",  checkBonusStatus);
// router.get("/:slug", getTask);
// router.patch("/:slug", upload.single("icon"), updateTask);
router.post("/collect", collectBonus);

export default router;