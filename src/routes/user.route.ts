const router = require("express").Router();
import { getLeaderBoard, getUserPoint } from "../controllers/point.controller";
import { getReferredUsers, getUser, getUsers, registerUser, saveOnboarding, userRanking, getSupportedTokens, getCurrentUser } from "../controllers/user.controller";
import { authenticateToken } from "../middleware/auth";

router.post("/register", registerUser);
router.get("/", getUsers);
router.get("/get-user", getUser); // Public: lookup any user by username
router.get("/me", authenticateToken, getCurrentUser); // Authenticated: get current user from JWT
router.get("/referrals", getReferredUsers);
router.get("/leaderboard", getLeaderBoard);
router.post("/onboard", saveOnboarding);
router.get("/points", getUserPoint);
router.get("/ranking", userRanking);
router.get("/supported-tokens", getSupportedTokens);


export default router;
