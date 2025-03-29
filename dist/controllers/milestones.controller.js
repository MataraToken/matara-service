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
            res.status(400).json({
                status: false,
                message: "Count and Points are required.",
            });
        }
        else {
            const milestone = new milestones_model_1.default({ count, points });
            await milestone.save();
            res.status(201).json({
                message: "Milestone created successfully",
                status: true,
            });
        }
    }
    catch (error) {
        res.status(500).json({ error: error, status: false });
    }
};
exports.createMilestone = createMilestone;
const getUserMileStones = async (req, res) => {
    try {
        const { username } = req.params;
        // Fetch the user and populate completed milestones
        const user = await user_model_1.default.findOne({ username })
            .populate("milestonesCompleted")
            .lean();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }
        // Extract completed milestones
        const completedMilestones = user.milestonesCompleted || [];
        const completedMilestoneIds = completedMilestones.map((milestone) => milestone._id);
        // // Fetch all milestones
        const allMilestones = await milestones_model_1.default.find().lean();
        if (!allMilestones.length) {
            return res.status(404).json({ status: false, message: "No milestones found" });
        }
        // Map through all milestones and determine if each is claimed
        const milestonesWithStatus = allMilestones.map((milestone) => ({
            ...milestone,
            claimed: completedMilestoneIds.toString().includes(milestone._id),
        }));
        return res.status(200).json({
            status: true,
            milestones: milestonesWithStatus,
            message: "User milestones fetched successfully",
        });
    }
    catch (error) {
        console.error("Error fetching user milestones:", error);
        return res.status(500).json({ status: false, message: "Internal server error", error: error.message });
    }
};
exports.getUserMileStones = getUserMileStones;
const completeMilestone = async (req, res) => {
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const { username, milestoneId } = req.body;
        // Validate request body
        if (!username || !milestoneId) {
            return res.status(400).json({ status: false, message: "Invalid data provided" });
        }
        // Fetch the user
        const user = await user_model_1.default.findOne({ username }).session(session);
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }
        // Fetch the user's points
        const points = await points_model_1.default.findOne({ userId: user._id }).session(session);
        if (!points) {
            return res.status(404).json({ status: false, message: "Points record not found" });
        }
        // Fetch the milestone
        const milestone = await milestones_model_1.default.findById(milestoneId).session(session);
        if (!milestone) {
            return res.status(404).json({ status: false, message: "Milestone not found" });
        }
        // Check if the milestone has already been completed
        if (user.milestonesCompleted.includes(milestone._id)) {
            return res.status(400).json({ status: false, message: "Milestone already completed" });
        }
        // Update milestones and points
        user.milestonesCompleted.push(milestone._id);
        const updatedPoints = points.points + milestone.points;
        await points_model_1.default.findByIdAndUpdate(points._id, { points: updatedPoints }, { session });
        await user.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(200).json({
            status: true,
            message: "Milestone completed successfully",
        });
    }
    catch (error) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({ status: false, message: "Internal server error", error: error.message });
    }
};
exports.completeMilestone = completeMilestone;
//# sourceMappingURL=milestones.controller.js.map