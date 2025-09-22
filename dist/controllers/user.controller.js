"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsers = exports.userRanking = exports.saveOnboarding = exports.getReferredUsers = exports.getUser = exports.registerUser = void 0;
const utils_1 = require("../utils");
const user_model_1 = __importDefault(require("../model/user.model"));
const points_model_1 = __importDefault(require("../model/points.model"));
const mongoose_1 = __importDefault(require("mongoose"));
const registerUser = async (req, res) => {
    const { username, referralCode, premium, profilePicture, firstName } = req.body;
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const alreadyExists = await user_model_1.default.findOne({ username }).session(session);
        if (alreadyExists) {
            await session.abortTransaction();
            session.endSession();
            return res.status(200).json({ message: "Username already exists" });
        }
        const newReferralId = (0, utils_1.generateReferralCode)();
        const newUser = new user_model_1.default({
            username,
            referralCode: newReferralId,
            premium,
            profilePicture,
            firstName,
        });
        const initialPoints = 1000;
        const additionalPoints = 500;
        const newPoints = new points_model_1.default({
            userId: newUser._id,
            points: initialPoints,
        });
        if (referralCode) {
            const referredBy = await user_model_1.default.findOne({ referralCode }).session(session);
            if (referredBy) {
                referredBy.referrals.push(newUser._id);
                await points_model_1.default.updateOne({ userId: referredBy._id }, { $inc: { points: additionalPoints } }).session(session);
                await referredBy.save({ session });
            }
        }
        await newUser.save({ session });
        await newPoints.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(201).json({
            message: "User registered successfully",
        });
    }
    catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error registering user:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.registerUser = registerUser;
const getUser = async (req, res) => {
    const { username } = req.query;
    try {
        const user = await user_model_1.default.findOne({ username }).lean();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const userPoints = await points_model_1.default.findOne({ userId: user._id }).lean();
        const { userBoosts, tasksCompleted, milestonesCompleted, referrals, ...filteredUser } = user;
        const mergedData = { ...filteredUser, ...userPoints };
        return res.status(200).json({
            data: mergedData,
            message: "User Fetched Successfully",
        });
    }
    catch (error) {
        console.error("Error fetching user:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.getUser = getUser;
const getReferredUsers = async (req, res) => {
    const { username } = req.query;
    try {
        const user = await user_model_1.default.findOne({ username }).populate("referrals", "username profilePicture premium").lean();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const referrals = user.referrals;
        const referralIds = referrals.map((ref) => ref._id);
        const points = await points_model_1.default.find({ userId: { $in: referralIds } }).lean();
        const pointsMap = new Map(points.map(p => [p.userId.toString(), p.points]));
        const referralsWithPoints = referrals.map((referral) => ({
            ...referral,
            points: pointsMap.get(referral._id.toString()) || 30000,
        }));
        return res.status(200).json({
            data: referralsWithPoints,
            message: "Referrals Fetched Successfully",
        });
    }
    catch (error) {
        console.error("Error getting referred users:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.getReferredUsers = getReferredUsers;
const saveOnboarding = async (req, res) => {
    const { username } = req.body;
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        user.onboarding = true;
        await user.save();
        return res.status(200).json({
            message: "Onboarding status updated successfully",
        });
    }
    catch (error) {
        console.error("Error saving onboarding:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.saveOnboarding = saveOnboarding;
const userRanking = async (req, res) => {
    try {
        const users = await user_model_1.default.find({}, 'username').lean();
        const userIds = users.map(user => user._id);
        const points = await points_model_1.default.find({ userId: { $in: userIds } }, 'userId points').lean();
        const pointsMap = new Map(points.map(p => [p.userId.toString(), p.points]));
        const userRankings = users.map(user => ({
            username: user.username,
            totalEarnings: pointsMap.get(user._id.toString()) || 0
        }))
            .sort((a, b) => b.totalEarnings - a.totalEarnings);
        return res.status(200).json({
            data: userRankings,
            message: "User rankings fetched successfully"
        });
    }
    catch (error) {
        console.error("Error fetching user rankings:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.userRanking = userRanking;
const getUsers = async (req, res) => {
    try {
        const users = await user_model_1.default.find().lean();
        res.status(200).json({
            data: users,
            message: "Users fetched successfully",
        });
    }
    catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getUsers = getUsers;
//# sourceMappingURL=user.controller.js.map