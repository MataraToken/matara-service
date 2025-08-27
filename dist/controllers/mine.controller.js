"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.miningState = exports.claimMining = exports.startMining = void 0;
const mining_model_1 = __importDefault(require("../model/mining.model"));
const user_model_1 = __importDefault(require("../model/user.model"));
const points_model_1 = __importDefault(require("../model/points.model"));
const mongoose_1 = __importDefault(require("mongoose"));
const REWARD_POINTS = 50;
const MINING_DURATION_HOURS = 24;
const startMining = async (req, res) => {
    const { username } = req.query;
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        let mining = await mining_model_1.default.findOne({ user: user._id });
        if (!mining) {
            mining = new mining_model_1.default({ user: user._id });
        }
        if (mining.isMining) {
            return res.status(400).json({ message: "Already mining" });
        }
        mining.miningStartedAt = new Date();
        mining.isMining = true;
        await mining.save();
        return res.status(200).json({
            data: mining,
            message: "Mining started",
        });
    }
    catch (err) {
        console.error("Start mining error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.startMining = startMining;
const claimMining = async (req, res) => {
    const { username, mineCount } = req.body;
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const user = await user_model_1.default.findOne({ username }).session(session);
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "User not found" });
        }
        const mining = await mining_model_1.default.findOne({ user: user._id }).session(session);
        if (!mining || !mining.isMining) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Mining not started" });
        }
        const now = new Date();
        const started = new Date(mining.miningStartedAt);
        const diffInMs = now.getTime() - started.getTime();
        const diffInHours = diffInMs / (1000 * 60 * 60);
        if (diffInHours < MINING_DURATION_HOURS) {
            const hoursLeft = (MINING_DURATION_HOURS - diffInHours).toFixed(2);
            await session.abortTransaction();
            session.endSession();
            return res
                .status(400)
                .json({ message: `${hoursLeft} hours left to claim` });
        }
        const points = await points_model_1.default.findOne({ userId: user._id }).session(session);
        if (!points) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Points record not found" });
        }
        points.points += Number(mineCount);
        await points.save({ session });
        mining.isMining = false;
        mining.lastClaimedAt = now;
        mining.miningStartedAt = null;
        await mining.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res
            .status(200)
            .json({ message: `You earned ${mineCount} points!` });
    }
    catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error("Claim mining error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.claimMining = claimMining;
const miningState = async (req, res) => {
    const { username } = req.query;
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const mining = await mining_model_1.default.findOne({ user: user._id });
        const points = await points_model_1.default.findOne({ userId: user._id });
        if (!points) {
            return res.status(404).json({ message: "Points record not found" });
        }
        if (!mining) {
            return res.status(200).json({
                isMining: false,
                timeLeft: 0,
                progress: 0,
                earnedPoints: 0,
                totalPoints: points.points,
                canClaim: false,
                lastClaimed: null,
            });
        }
        if (!mining.isMining) {
            return res.status(200).json({
                isMining: false,
                timeLeft: 0,
                progress: 0,
                earnedPoints: 0,
                totalPoints: points.points,
                canClaim: false,
                lastClaimed: mining.lastClaimedAt,
            });
        }
        const now = new Date();
        const started = new Date(mining.miningStartedAt);
        const diffInMs = now.getTime() - started.getTime();
        const diffInHours = diffInMs / (1000 * 60 * 60);
        const progress = Math.min((diffInHours / MINING_DURATION_HOURS) * 100, 100);
        const timeLeft = Math.max(MINING_DURATION_HOURS - diffInHours, 0);
        const canClaim = diffInHours >= MINING_DURATION_HOURS;
        const earnedPoints = canClaim
            ? REWARD_POINTS
            : Math.floor((diffInHours / MINING_DURATION_HOURS) * REWARD_POINTS);
        return res.status(200).json({
            isMining: true,
            timeLeft: parseFloat(timeLeft.toFixed(2)),
            progress: parseFloat(progress.toFixed(2)),
            earnedPoints,
            totalPoints: points.points,
            canClaim,
            miningStartedAt: mining.miningStartedAt,
            lastClaimed: mining.lastClaimedAt,
        });
    }
    catch (err) {
        console.error("Mining state error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.miningState = miningState;
//# sourceMappingURL=mine.controller.js.map