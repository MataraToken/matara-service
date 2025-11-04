"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = exports.validate = exports.projectValidator = exports.taskValidator = void 0;
const express_validator_1 = require("express-validator");
const auth_1 = require("./auth");
Object.defineProperty(exports, "authenticateToken", { enumerable: true, get: function () { return auth_1.authenticateToken; } });
const mongoose_1 = __importDefault(require("mongoose"));
exports.taskValidator = [
    (0, express_validator_1.check)("title")
        .isString()
        .withMessage("Title must be a string")
        .notEmpty()
        .withMessage("Title cannot be empty"),
    (0, express_validator_1.check)("description")
        .isString()
        .withMessage("Description must be a string")
        .notEmpty()
        .withMessage("Description cannot be empty"),
    (0, express_validator_1.check)("points").isNumeric().withMessage("Points must be a number"),
    (0, express_validator_1.check)("projectId")
        .notEmpty()
        .withMessage("projectId is required")
        .custom((value) => {
        if (!mongoose_1.default.Types.ObjectId.isValid(value)) {
            throw new Error("Invalid projectId format");
        }
        return true;
    }),
];
exports.projectValidator = [
    (0, express_validator_1.check)("name")
        .isString()
        .withMessage("Name must be a string")
        .notEmpty()
        .withMessage("Name cannot be empty"),
    (0, express_validator_1.check)("description")
        .isString()
        .withMessage("Description must be a string")
        .notEmpty()
        .withMessage("Description cannot be empty"),
    (0, express_validator_1.check)("numberOfParticipants")
        .isNumeric()
        .withMessage("numberOfParticipants must be a number")
        .isInt({ min: 1 })
        .withMessage("numberOfParticipants must be at least 1"),
    (0, express_validator_1.check)("socials")
        .optional()
        .custom((value) => {
        if (value !== undefined && value !== null) {
            try {
                const parsed = typeof value === "string" ? JSON.parse(value) : value;
                if (!Array.isArray(parsed)) {
                    throw new Error("Socials must be an array");
                }
                // Validate each social object
                for (const social of parsed) {
                    if (!social.platform || !social.url) {
                        throw new Error("Each social must have platform and url");
                    }
                }
            }
            catch (error) {
                throw new Error(error.message || "Invalid socials format");
            }
        }
        return true;
    }),
];
const validate = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const formattedErrors = errors
            .array()
            .map((err) => err.msg);
        const errorMessage = formattedErrors.join(", ");
        return res.status(400).json({ status: false, message: errorMessage });
    }
    next();
};
exports.validate = validate;
//# sourceMappingURL=index.js.map