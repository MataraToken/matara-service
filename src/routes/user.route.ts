const router = require("express").Router();
import { getLeaderBoard, getUserPoint } from "../controllers/point.controller";
import { getReferredUsers, getUser, registerUser, saveOnboarding } from "../controllers/user.controller";

router.post("/register", registerUser);
router.get("/get-user", getUser);
router.get("/referrals", getReferredUsers);
router.get("/leaderboard", getLeaderBoard);
router.post("/onboard", saveOnboarding);
router.get("/points", getUserPoint)


export default router;
