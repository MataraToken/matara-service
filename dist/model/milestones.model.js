"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const milestoneSchema = new mongoose_1.default.Schema({
    count: {
        type: String,
        required: true,
        default: 5
    },
    points: {
        type: Number,
        required: true,
    },
}, { timestamps: true });
const Milestone = mongoose_1.default.model("Milestone", milestoneSchema);
exports.default = Milestone;
//# sourceMappingURL=milestones.model.js.map