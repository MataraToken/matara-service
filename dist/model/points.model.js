"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const pointsSchema = new mongoose_1.default.Schema({
    userId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    points: {
        type: Number,
        default: 30000,
    },
    energy: {
        type: Number,
        default: 500,
    },
    energyStamp: {
        type: Date,
        default: Date.now,
    },
    lastTapTime: { type: Date, default: Date.now },
}, { timestamps: true });
const Point = mongoose_1.default.model("Point", pointsSchema);
exports.default = Point;
//# sourceMappingURL=points.model.js.map