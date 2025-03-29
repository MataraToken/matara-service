"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateUser = void 0;
const user_model_1 = __importDefault(require("../model/user.model"));
const authenticateUser = async (req, res) => {
    const { username } = req.body;
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }
        else {
        }
    }
    catch (error) {
    }
};
exports.authenticateUser = authenticateUser;
//# sourceMappingURL=auth.controller.js.map