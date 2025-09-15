"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeaderboard = exports.getSummary = void 0;
const user_model_1 = __importDefault(require("../model/user.model"));
const task_model_1 = __importDefault(require("../model/task.model"));
const points_model_1 = __importDefault(require("../model/points.model"));
const getSummary = async (req, res) => {
    try {
        const totalUsers = await user_model_1.default.countDocuments();
        const totalTasks = await task_model_1.default.countDocuments();
        // Count users who have completed at least one task
        const usersWithCompletedTasks = await user_model_1.default.countDocuments({ tasksCompleted: { $exists: true, $ne: [] } });
        // Calculate the total number of completed tasks across all users
        const usersAggregation = await user_model_1.default.aggregate([
            { $project: { completedTasksCount: { $size: { $ifNull: ["$tasksCompleted", []] } } } },
            { $group: { _id: null, totalCompletedTasks: { $sum: "$completedTasksCount" } } }
        ]);
        const totalCompletedTasks = usersAggregation.length > 0 ? usersAggregation[0].totalCompletedTasks : 0;
        res.status(200).json({
            data: {
                totalUsers,
                totalTasks,
                totalCompletedTasks,
                usersWithCompletedTasks,
            },
            message: "Summary fetched successfully",
        });
    }
    catch (error) {
        console.error("Error fetching summary:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getSummary = getSummary;
const getLeaderboard = async (req, res) => {
    try {
        const topUsers = await points_model_1.default.find()
            .sort({ points: -1 })
            .limit(5)
            .populate("userId", "username profilePicture");
        res.status(200).json({
            data: topUsers,
            message: "Leaderboard fetched successfully",
        });
    }
    catch (error) {
        console.error("Error fetching leaderboard:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getLeaderboard = getLeaderboard;
//# sourceMappingURL=stats.controller.js.map