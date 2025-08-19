"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeMilestone = exports.getUserMileStones = exports.createMilestone = void 0;
const points_model_1 = __importDefault(require("../model/points.model"));
const milestones_model_1 = __importDefault(require("../model/milestones.model"));
const user_model_1 = __importDefault(require("../model/user.model"));
const mongoose_1 = __importDefault(require("mongoose"));
const createMilestone = async (req, res) => {
    try {
        const { count, points } = req.body;
        if (!count || !points) {
            return res.status(400).json({
                message: "Count and Points are required.",
            });
        }
        const milestone = new milestones_model_1.default({ count, points });
        await milestone.save();
        return res.status(201).json({
            message: "Milestone created successfully",
        });
    }
    catch (error) {
        console.error("Error creating milestone:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.createMilestone = createMilestone;
const getUserMileStones = async (req, res) => {
    try {
        const { username } = req.params;
        const user = await user_model_1.default.findOne({ username })
            .select("milestonesCompleted")
            .lean();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const completedMilestoneIds = new Set(user.milestonesCompleted.map((id) => id.toString()));
        const allMilestones = await milestones_model_1.default.find().lean();
        const milestonesWithStatus = allMilestones.map((milestone) => ({
            ...milestone,
            claimed: completedMilestoneIds.has(milestone._id.toString()),
        }));
        return res.status(200).json({
            milestones: milestonesWithStatus,
            message: "User milestones fetched successfully",
        });
    }
    catch (error) {
        console.error("Error fetching user milestones:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.getUserMileStones = getUserMileStones;
const completeMilestone = async (req, res) => {
    const { username, milestoneId } = req.body;
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const user = await user_model_1.default.findOne({ username }).session(session);
        const milestone = await milestones_model_1.default.findById(milestoneId).session(session);
        if (!user || !milestone) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "User or Milestone not found" });
        }
        if (user.milestonesCompleted.includes(milestone._id)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Milestone already completed" });
        }
        const points = await points_model_1.default.findOne({ userId: user._id }).session(session);
        if (!points) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Points not found" });
        }
        user.milestonesCompleted.push(milestone._id);
        points.points += milestone.points;
        await user.save({ session });
        await points.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(200).json({
            message: "Milestone completed successfully",
        });
    }
    catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error completing milestone:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.completeMilestone = completeMilestone;
//# sourceMappingURL=milestones.controller.js.map