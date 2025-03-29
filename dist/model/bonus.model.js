"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const bonusSchema = new mongoose_1.default.Schema({
    userId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    lastLogin: {
        type: Date,
        default: Date.now, // Set the default to the current time
        required: true,
    },
    loginStreak: {
        type: Number,
        default: 0, // Default streak starts at 0
    },
    bonusCollected: {
        type: Boolean,
        default: false, // Default bonus collected is false
    },
}, {
    timestamps: true, // Automatically manage createdAt and updatedAt fields
});
const Bonuses = mongoose_1.default.model("Bonus", bonusSchema);
exports.default = Bonuses;
//# sourceMappingURL=bonus.model.js.map