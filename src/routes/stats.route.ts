const router = require("express").Router();
import { getSummary, getLeaderboard } from "../controllers/stats.controller";

router.get("/summary", getSummary);
router.get("/leaderboard", getLeaderboard);

export default router;