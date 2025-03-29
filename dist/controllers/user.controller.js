"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveOnboarding = exports.getReferredUsers = exports.getUser = exports.registerUser = void 0;
const utils_1 = require("../utils");
const user_model_1 = __importDefault(require("../model/user.model"));
const points_model_1 = __importDefault(require("../model/points.model"));
const registerUser = async (req, res) => {
    const { username, referralCode, premium, profilePicture, firstName } = req.body;
    try {
        // Check if the username already exists
        const alreadyExists = (await user_model_1.default.findOne({ username }));
        if (alreadyExists) {
            return res.status(200).json({ message: "Username already exists" });
        }
        // Generate a new referral code for the new user
        const newReferralId = (0, utils_1.generateReferralCode)();
        // Create a new user
        const newUser = new user_model_1.default({
            username,
            referralCode: newReferralId,
            premium,
            profilePicture,
            firstName
        });
        // Save the new user
        await newUser.save();
        const initialPoints = 30000;
        const additionalPoints = 1000;
        const newPoints = new points_model_1.default({
            userId: newUser._id,
            points: initialPoints + additionalPoints,
        });
        await newPoints.save();
        // If there is a referral code, find the referring user and update their referrals
        if (referralCode) {
            const referredBy = await user_model_1.default.findOne({ referralCode });
            if (referredBy) {
                referredBy.referrals.push(newUser._id);
                const referredPoint = points_model_1.default.findOne({ userId: referredBy._id });
                if (referredPoint) {
                    (await referredPoint).points += additionalPoints; // Add 100,000 points to the referrer
                }
                await referredBy.save();
                console.log(`Updated referrals for ${referredBy.username}: ${referredBy.referrals}`);
            }
        }
        return res.status(201).json({
            statusCode: 201,
            message: "User registered successfully",
            status: true,
        });
    }
    catch (error) {
        console.log("Error registering user:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
exports.registerUser = registerUser;
// export const getUser = async (req: Request, res: Response) => {
//   const { username } = req.query;
//   try {
//     const user = await User.findOne({ username });
//     const userPoints = await Point.findOne({ userId: user._id });
//     const mergedData = { ...user.toObject(), ...userPoints?.toObject() };
//     if (!user) {
//       return res.status(400).json({ error: "User not found" });
//     } else {
//       return res.status(200).json({
//         data: {user,userPoints},
//         message: "User Fetched Successfully",
//         status: true,
//       });
//     }
//   } catch (error) {
//     // console.error("Error authenticating user:", error);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };
const getUser = async (req, res) => {
    const { username } = req.query;
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: "User not found" });
        }
        const userPoints = await points_model_1.default.findOne({ userId: user._id });
        // Convert the Mongoose document to a plain object
        let userObject = user.toObject();
        // Exclude specific fields
        const { userBoosts, tasksCompleted, milestonesCompleted, referrals, ...filteredUser } = userObject;
        // Merging filteredUser and userPoints into one object
        const mergedData = { ...filteredUser, ...userPoints?.toObject() };
        return res.status(200).json({
            data: mergedData,
            message: "User Fetched Successfully",
            status: true,
        });
    }
    catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
};
exports.getUser = getUser;
const getReferredUsers = async (req, res) => {
    const { username } = req.query;
    try {
        const user = await user_model_1.default.findOne({ username }).populate("referrals", "username profilePicture premium"); // Populate the referred users with only the required fields
        if (!user) {
            return res.status(400).json({ error: "User not found" });
        }
        else {
            const referrals = user.referrals;
            const referralsWithPoints = await Promise.all(referrals.map(async (referral) => {
                const userPoints = await points_model_1.default.findOne({ userId: referral._id });
                return {
                    ...referral._doc,
                    points: userPoints ? userPoints.points : 30000, // If no points found, default to 0
                };
            }));
            // Return the referred users in the response
            return res.status(200).json({
                data: referralsWithPoints,
                message: "Referrals Fetched Successfully",
                status: true,
            });
        }
    }
    catch (error) {
        console.log("Error getting referred users:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
exports.getReferredUsers = getReferredUsers;
const saveOnboarding = async (req, res) => {
    const { username } = req.body;
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            return res.status(400).json({ status: false, error: "User not found" });
        }
        else {
            user.onboarding = true;
            await user.save();
            return res.status(200).json({
                status: true,
                message: "Onboarding status updated successfully",
            });
        }
    }
    catch (error) {
        return res
            .status(500)
            .json({ status: false, error: "Internal server error" });
    }
};
exports.saveOnboarding = saveOnboarding;
// export const updateUser = async (req: Request, res: Response) => {
//   const { username,  level } = req.body;
//   try {
//     const user = await User.findOne({ username });
//     if (!user) {
//       return res.status(400).json({ error: "User not found" });
//     }
//     if (level !== undefined) user.level = level;
//   } catch (error) {
//     res.json({
//       error: error||  "Internal server error",
//       status: false,
//     })
//   }
// }
//# sourceMappingURL=user.controller.js.map