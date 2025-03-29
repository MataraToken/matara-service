"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectBonus = exports.checkBonusStatus = void 0;
const user_model_1 = __importDefault(require("../model/user.model"));
const bonus_model_1 = __importDefault(require("../model/bonus.model"));
const points_model_1 = __importDefault(require("../model/points.model"));
const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000; // One day in milliseconds
const checkBonusStatus = async (req, res) => {
    const { username } = req.params; // Assuming you pass the username from the frontend
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const loginBonus = await bonus_model_1.default.findOne({ userId: user._id });
        if (!loginBonus) {
            return res.status(200).json({
                status: true,
                message: "User has not collected any bonuses yet. Eligible for today's bonus.",
                isEligible: true,
                loginStreak: 0,
                bonusCollected: false,
            });
        }
        const currentTime = new Date();
        const lastLoginTime = new Date(loginBonus.lastLogin);
        const timeDifference = currentTime.getTime() - lastLoginTime.getTime();
        if (timeDifference >= 24 * 60 * 60 * 1000) {
            return res.status(200).json({
                status: true,
                message: "User is eligible to collect today's bonus.",
                isEligible: true,
                loginStreak: loginBonus.loginStreak,
                bonusCollected: false,
            });
        }
        else {
            return res.status(200).json({
                status: false,
                message: "User has already collected today's bonus.",
                isEligible: false,
                loginStreak: loginBonus.loginStreak,
                bonusCollected: true,
            });
        }
    }
    catch (error) {
        return res.status(500).json({ message: "Internal server error", error });
    }
};
exports.checkBonusStatus = checkBonusStatus;
const collectBonus = async (req, res) => {
    const { username } = req.body; // Assuming username is passed from the frontend
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const points = await points_model_1.default.findOne({ userId: user._id });
        const loginBonus = await bonus_model_1.default.findOne({ userId: user._id });
        const currentTime = new Date();
        // If the user doesn't have a bonus record, create one and collect the first bonus
        if (!loginBonus) {
            const newBonus = new bonus_model_1.default({
                userId: user._id,
                lastLogin: currentTime,
                loginStreak: 1,
                bonusCollected: true,
            });
            const bonusPoints = calculateBonus(1);
            points.points += bonusPoints;
            await points.save();
            await newBonus.save();
            return res.status(200).json({
                status: true,
                message: "First daily bonus collected!",
                loginStreak: 1,
                bonusPoints,
                totalPoints: points.points,
            });
        }
        const lastLoginTime = new Date(loginBonus.lastLogin);
        const timeDifference = currentTime.getTime() - lastLoginTime.getTime();
        // Check if the user is eligible for a new bonus (24 hours must have passed)
        if (timeDifference >= MILLISECONDS_IN_A_DAY) {
            // Reset streak if the user missed more than 48 hours
            if (timeDifference >= MILLISECONDS_IN_A_DAY * 2) {
                loginBonus.loginStreak = 0;
            }
            // Award the bonus
            loginBonus.loginStreak += 1;
            loginBonus.bonusCollected = true;
            loginBonus.lastLogin = currentTime;
            const bonusPoints = calculateBonus(loginBonus.loginStreak);
            points.points += bonusPoints;
            await points.save();
            await loginBonus.save();
            return res.status(200).json({
                status: true,
                message: "Daily bonus collected!",
                loginStreak: loginBonus.loginStreak,
                bonusPoints,
                totalPoints: points.points,
            });
        }
        else {
            // If the user already collected today's bonus
            return res.status(400).json({
                status: false,
                message: "Bonus already collected for today.",
                loginStreak: loginBonus.loginStreak,
            });
        }
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal server error", error });
    }
};
exports.collectBonus = collectBonus;
// Example function to calculate bonus based on streak
const calculateBonus = (streak) => {
    if (streak === 0)
        return 1000; // Return 1000 if streak is 0
    const baseBonus = 1000;
    const additionalBonus = 1000 * (streak - 1); // Add 1000 for each additional day
    return baseBonus + additionalBonus;
};
//# sourceMappingURL=bonus.controller.js.map