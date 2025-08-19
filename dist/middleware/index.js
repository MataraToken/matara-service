"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = exports.taskValidator = void 0;
const express_validator_1 = require("express-validator");
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