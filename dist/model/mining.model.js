"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const miningSchema = new mongoose_1.default.Schema({
    user: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
    },
    miningStartedAt: { type: Date, default: null },
    lastClaimedAt: { type: Date, default: null },
    isMining: { type: Boolean, default: false },
    sessionPoints: { type: Number, default: 0 }
});
const Mining = mongoose_1.default.model("Mining", miningSchema);
exports.default = Mining;
//# sourceMappingURL=mining.model.js.map