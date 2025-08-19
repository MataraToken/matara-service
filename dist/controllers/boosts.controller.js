"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.purchaseBoost = exports.getBoosts = exports.createBoost = void 0;
const points_model_1 = __importDefault(require("../model/points.model"));
const boosts_model_1 = __importDefault(require("../model/boosts.model"));
const user_model_1 = __importDefault(require("../model/user.model"));
const mongoose_1 = __importDefault(require("mongoose"));
const createBoost = async (req, res) => {
    try {
        const { count, points } = req.body;
        if (!count || !points) {
            return res.status(400).json({
                message: "Count and Points are required.",
            });
        }
        const boost = new boosts_model_1.default({ count, points });
        await boost.save();
        return res.status(201).json({
            message: "Boost created successfully",
        });
    }
    catch (error) {
        console.error("Error creating boost:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.createBoost = createBoost;
const getBoosts = async (req, res) => {
    try {
        const { username } = req.params;
        const user = await user_model_1.default.findOne({ username }).select("userBoosts").lean();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const userBoostIds = new Set(user.userBoosts.map(id => id.toString()));
        const allBoosts = await boosts_model_1.default.find().lean();
        const boosts = allBoosts.map((boost) => ({
            ...boost,
            owned: userBoostIds.has(boost._id.toString()),
        }));
        return res.status(200).json({
            data: boosts,
            message: "Boosts fetched successfully",
        });
    }
    catch (error) {
        console.error("Error fetching boosts:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.getBoosts = getBoosts;
const purchaseBoost = async (req, res) => {
    const { username, boostId } = req.body;
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const user = await user_model_1.default.findOne({ username }).session(session);
        const boost = await boosts_model_1.default.findById(boostId).session(session);
        if (!user || !boost) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "User or Boost not found" });
        }
        if (user.userBoosts.includes(boost._id)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Boost already owned" });
        }
        const points = await points_model_1.default.findOne({ userId: user._id }).session(session);
        if (!points || points.points < boost.points) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Insufficient points" });
        }
        points.points -= boost.points;
        user.userBoosts.push(boost._id);
        await user.save({ session });
        await points.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(200).json({ message: "Boost purchased successfully" });
    }
    catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error purchasing boost:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.purchaseBoost = purchaseBoost;
//# sourceMappingURL=boosts.controller.js.map