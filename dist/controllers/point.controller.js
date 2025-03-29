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
        const userPoints = await points_model_1.default.findOne({ userId: user._id });
        console.log({ points, username });
        if (userPoints) {
            const currentPoints = userPoints.points;
            const pointsToAdd = Number(points) - Number(currentPoints);
            userPoints.points += pointsToAdd;
            await userPoints.save();
        }
        else {
            const userId = user._id;
            console.log(userId);
            const newPoints = new points_model_1.default({ points, userId });
            await newPoints.save();
        }
        console.log("Points updated successfully");
    }
    catch (error) {
        console.log(error);
    }
};
exports.addPoints = addPoints;
const saveTimeStamps = async (message) => {
    const { username, timestamp } = message;
    try {
        const user = await user_model_1.default.findOne({ username });
        const points = await points_model_1.default.findOne({ userId: user._id });
        points.energyStamp = timestamp;
        await points.save();
    }
    catch (error) {
        console.log(error);
    }
};
exports.saveTimeStamps = saveTimeStamps;
const getUserPoint = async (req, res) => {
    const { username } = req.query;
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            return res.status(400).json({ status: false, error: "User not found" });
        }
        const points = await points_model_1.default.findOne({ userId: user._id });
        res.json({
            status: true,
            data: points,
            message: "Points fetched successfully",
        });
    }
    catch (error) {
        res.status(500).json({
            status: false,
            message: "An error occurred while fetching points",
        });
    }
};
exports.getUserPoint = getUserPoint;
const getLeaderBoard = async (req, res) => {
    try {
        // Get the top 50 users with the highest points
        const leaderboard = await points_model_1.default.find()
            .sort({ points: -1 }) // Sort by points in descending order
            .limit(50) // Limit to top 50
            .populate("userId", "username profilePicture level")
            .lean();
        // Populate user details (replace 'name email' with actual fields from User model)
        const result = leaderboard.map((entry) => ({
            user: entry.userId, // This will contain the populated user details
            points: entry.points, // The user's points
        }));
        res.json({
            status: true,
            data: result,
            message: "Leaderboard fetched successfully",
        });
    }
    catch (error) {
        console.error("Error fetching leaderboard:", error);
        res.status(500).json({
            status: false,
            message: "An error occurred while fetching the leaderboard",
        });
    }
};
exports.getLeaderBoard = getLeaderBoard;
//# sourceMappingURL=point.controller.js.map