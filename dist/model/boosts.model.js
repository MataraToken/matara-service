"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const boostSchema = new mongoose_1.default.Schema({
    count: {
        type: Number,
        required: true,
        default: 2
    },
    points: {
        type: Number,
        required: true,
    },
}, { timestamps: true });
const Boosts = mongoose_1.default.model("Boost", boostSchema);
exports.default = Boosts;
//# sourceMappingURL=boosts.model.js.map