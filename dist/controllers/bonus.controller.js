"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectBonus = exports.checkBonusStatus = void 0;
const user_model_1 = __importDefault(require("../model/user.model"));
const bonus_model_1 = __importDefault(require("../model/bonus.model"));
const points_model_1 = __importDefault(require("../model/points.model"));
const mongoose_1 = __importDefault(require("mongoose"));
const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;
const checkBonusStatus = async (req, res) => {
    const { username } = req.params;
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const loginBonus = await bonus_model_1.default.findOne({ userId: user._id });
        if (!loginBonus) {
            return res.status(200).json({
                isEligible: true,
                loginStreak: 0,
            });
        }
        const currentTime = new Date();
        const lastLoginTime = new Date(loginBonus.lastLogin);
        const timeDifference = currentTime.getTime() - lastLoginTime.getTime();
        const isEligible = timeDifference >= MILLISECONDS_IN_A_DAY;
        return res.status(200).json({
            isEligible,
            loginStreak: loginBonus.loginStreak,
        });
    }
    catch (error) {
        console.error("Error checking bonus status:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.checkBonusStatus = checkBonusStatus;
const collectBonus = async (req, res) => {
    const { username } = req.body;
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const user = await user_model_1.default.findOne({ username }).session(session);
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "User not found" });
        }
        const points = await points_model_1.default.findOne({ userId: user._id }).session(session);
        if (!points) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Points not found" });
        }
        let loginBonus = await bonus_model_1.default.findOne({ userId: user._id }).session(session);
        const currentTime = new Date();
        if (loginBonus) {
            const lastLoginTime = new Date(loginBonus.lastLogin);
            const timeDifference = currentTime.getTime() - lastLoginTime.getTime();
            if (timeDifference < MILLISECONDS_IN_A_DAY) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: "Bonus already collected for today." });
            }
            if (timeDifference >= MILLISECONDS_IN_A_DAY * 2) {
                loginBonus.loginStreak = 0;
            }
            loginBonus.loginStreak += 1;
            loginBonus.lastLogin = currentTime;
        }
        else {
            loginBonus = new bonus_model_1.default({
                userId: user._id,
                lastLogin: currentTime,
                loginStreak: 1,
            });
        }
        const bonusPoints = calculateBonus(loginBonus.loginStreak);
        points.points += bonusPoints;
        await loginBonus.save({ session });
        await points.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(200).json({
            message: "Bonus collected successfully!",
            loginStreak: loginBonus.loginStreak,
            bonusPoints,
            totalPoints: points.points,
        });
    }
    catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error collecting bonus:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.collectBonus = collectBonus;
const calculateBonus = (streak) => {
    if (streak === 0)
        return 1000;
    const baseBonus = 1000;
    const additionalBonus = 1000 * (streak - 1);
    return baseBonus + additionalBonus;
};
//# sourceMappingURL=bonus.controller.js.map