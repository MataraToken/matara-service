const router = require("express").Router();
import { startMining, claimMining, miningState } from "../controllers/mine.controller";

router.post("/start", startMining);
router.post("/claim", claimMining);
router.get("/state", miningState);

export default router;
