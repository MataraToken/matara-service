"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.purchaseBoost = exports.getBoosts = exports.createBoost = void 0;
const boosts_model_1 = __importDefault(require("../model/boosts.model"));
const user_model_1 = __importDefault(require("../model/user.model"));
const createBoost = async (req, res) => {
    try {
        const { count, points } = req.body;
        if (!count || !points) {
            res.status(400).json({
                status: false,
                message: "Count and Points are required.",
            });
        }
        else {
            const boost = new boosts_model_1.default({ count, points });
            await boost.save();
            res.status(201).json({
                message: "Boosts created successfully",
                status: true,
            });
        }
    }
    catch (error) {
        res.status(500).json({ error: error, status: false });
    }
};
exports.createBoost = createBoost;
const getBoosts = async (req, res) => {
    try {
        const { username } = req.params;
        const user = await user_model_1.default.findOne({ username }).populate("userBoosts").lean();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }
        const userBoosts = user.userBoosts || [];
        const userBoostIds = userBoosts.map((boost) => boost._id);
        const allBoosts = await boosts_model_1.default.find().lean();
        if (!allBoosts.length) {
            return res
                .status(404)
                .json({ status: false, message: "No boosts found" });
        }
        const boosts = allBoosts.map((boost) => ({
            ...boost,
            owned: userBoostIds.toString().includes(boost._id),
        }));
        res.status(200).json({
            status: true,
            data: boosts,
            message: "Bossts fetched successfully",
        });
    }
    catch (error) {
        res
            .status(500)
            .json({ error: error, status: false, message: "An error occurred" });
    }
};
exports.getBoosts = getBoosts;
const purchaseBoost = async (req, res) => {
    try {
        const { username, boostId } = req.body;
        const user = await user_model_1.default.findOne({ username }).populate("userBoosts");
        const boost = await boosts_model_1.default.findById(boostId);
        if (!user || !boost) {
            return res
                .status(404)
                .json({ status: false, message: "User or Boost not found" });
        }
        const userBoosts = user.userBoosts || [];
        const userBoostIds = userBoosts.map((boost) => boost._id);
        console.log(userBoostIds);
        if (userBoostIds.toString().includes(boostId)) {
            return res
                .status(400)
                .json({ status: false, message: "Boost already owned" });
        }
        // if (userPoints.points < boost.points) {
        //     return res.status(400).json({ status: false, message: "Insufficient points" });
        // }
        // userPoints.points -= boost.points;
        user.userBoosts.push(boostId);
        await user.save();
        // await userPoints.save();
        // await User.findByIdAndUpdate(user._id, user);
        res
            .status(200)
            .json({ status: true, message: "Boost purchased successfully" });
    }
    catch (error) {
        console.log(error);
        res
            .status(500)
            .json({ error: error, status: false, message: "An error occurred" });
    }
};
exports.purchaseBoost = purchaseBoost;
//# sourceMappingURL=boosts.controller.js.map