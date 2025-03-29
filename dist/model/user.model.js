"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const userSchema = new mongoose_1.default.Schema({
    username: {
        type: String,
        required: true,
    },
    level: {
        type: Number,
        default: 1,
    },
    currentTapCount: {
        type: Number,
        default: 1,
    },
    maxPoints: {
        type: Number,
        default: 500,
    },
    premium: {
        type: Boolean,
        default: false,
    },
    profilePicture: {
        type: String,
    },
    referrals: [
        {
            type: mongoose_1.default.Schema.Types.ObjectId,
            ref: "User",
        },
    ],
    referralCode: {
        type: String,
    },
    onboarding: {
        type: Boolean,
        default: false,
    },
    autoTapEndTime: { type: Date, default: null },
    autoTapPaused: { type: Boolean, default: false },
    tasksCompleted: [
        {
            type: mongoose_1.default.Schema.Types.ObjectId,
            ref: "Task",
        },
    ],
    milestonesCompleted: [
        {
            type: mongoose_1.default.Schema.Types.ObjectId,
            ref: "Milestone",
        },
    ],
    // loginStreak: {
    //   type: Number,
    //   default: 0,
    // },
    // lastLogin: {
    //   type: Date,
    //   default: Date.now,
    // },
    userBoosts: [
        {
            type: mongoose_1.default.Schema.Types.ObjectId,
            ref: "Boost",
        },
    ]
}, { timestamps: true });
const User = mongoose_1.default.model("User", userSchema);
exports.default = User;
//# sourceMappingURL=user.model.js.map