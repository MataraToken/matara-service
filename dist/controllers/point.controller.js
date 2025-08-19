"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeaderBoard = exports.getUserPoint = exports.saveTimeStamps = exports.addPoints = void 0;
const user_model_1 = __importDefault(require("../model/user.model"));
const points_model_1 = __importDefault(require("../model/points.model"));
const addPoints = async (message) => {
    const { points, username } = message;
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            console.error("User not found");
            return;
        }
        await points_model_1.default.updateOne({ userId: user._id }, { $inc: { points: points } }, { upsert: true });
        console.log("Points updated successfully");
    }
    catch (error) {
        console.error("Error adding points:", error);
    }
};
exports.addPoints = addPoints;
const saveTimeStamps = async (message) => {
    const { username, timestamp } = message;
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            console.error("User not found");
            return;
        }
        await points_model_1.default.updateOne({ userId: user._id }, { energyStamp: timestamp });
    }
    catch (error) {
        console.error("Error saving timestamp:", error);
    }
};
exports.saveTimeStamps = saveTimeStamps;
const getUserPoint = async (req, res) => {
    const { username } = req.query;
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const points = await points_model_1.default.findOne({ userId: user._id });
        return res.status(200).json({
            data: points,
            message: "Points fetched successfully",
        });
    }
    catch (error) {
        console.error("Error fetching user points:", error);
        return res.status(500).json({
            message: "An error occurred while fetching points",
        });
    }
};
exports.getUserPoint = getUserPoint;
const getLeaderBoard = async (req, res) => {
    try {
        const leaderboard = await points_model_1.default.find()
            .sort({ points: -1 })
            .limit(50)
            .populate("userId", "username profilePicture level")
            .lean();
        const result = leaderboard.map((entry) => ({
            user: entry.userId,
            points: entry.points,
        }));
        return res.status(200).json({
            data: result,
            message: "Leaderboard fetched successfully",
        });
    }
    catch (error) {
        console.error("Error fetching leaderboard:", error);
        return res.status(500).json({
            message: "An error occurred while fetching the leaderboard",
        });
    }
};
exports.getLeaderBoard = getLeaderBoard;
//# sourceMappingURL=point.controller.js.map