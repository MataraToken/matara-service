"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimMining = exports.startMining = void 0;
const mining_model_1 = __importDefault(require("../model/mining.model"));
const user_model_1 = __importDefault(require("../model/user.model"));
const points_model_1 = __importDefault(require("model/points.model"));
// Points rewarded after 24hrs
const REWARD_POINTS = 50;
const startMining = async (req, res) => {
    const { username } = req.body;
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user)
            return res.status(400).json({ status: false, error: "User not found" });
        let mining = await mining_model_1.default.findOne({ user: user._id });
        if (!mining) {
            mining = new mining_model_1.default({ user: user._id });
        }
        if (mining.isMining) {
            return res.status(400).json({ status: false, message: "Already mining" });
        }
        mining.miningStartedAt = new Date();
        mining.isMining = true;
        await mining.save();
        return res.status(200).json({ status: true, data: {}, message: "Mining started" });
    }
    catch (err) {
        console.error("Start mining error:", err);
        return res.status(500).json({ status: false, error: "Internal server error" });
    }
};
exports.startMining = startMining;
const claimMining = async (req, res) => {
    const { username } = req.body;
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user)
            return res.status(400).json({ status: false, error: "User not found" });
        const mining = await mining_model_1.default.findOne({ user: user._id });
        if (!mining || !mining.isMining) {
            return res.status(400).json({ status: false, message: "Mining not started" });
        }
        const now = new Date();
        const started = new Date(mining.miningStartedAt);
        const diffInMs = now.getTime() - started.getTime();
        const diffInHours = diffInMs / (1000 * 60 * 60);
        if (diffInHours < 24) {
            const hoursLeft = (24 - diffInHours).toFixed(2);
            return res.status(400).json({ status: false, message: `${hoursLeft} hours left to claim` });
        }
        const points = await points_model_1.default.findOne({ userId: user.id });
        if (!points) {
            return res.status(404).json({ status: false, message: "Points record not found" });
        }
        // Add points to user's points record
        points.points += REWARD_POINTS;
        await points.save();
        // Add points to user
        // user.points = (user.points || 0) + REWARD_POINTS;
        // await user.save();
        // Reset mining state
        mining.isMining = false;
        mining.lastClaimedAt = now;
        mining.miningStartedAt = null;
        await mining.save();
        return res.status(200).json({ status: true, message: `You earned ${REWARD_POINTS} points!` });
    }
    catch (err) {
        console.error("Claim mining error:", err);
        return res.status(500).json({ status: false, error: "Internal server error" });
    }
};
exports.claimMining = claimMining;
//# sourceMappingURL=mine.controller.js.map