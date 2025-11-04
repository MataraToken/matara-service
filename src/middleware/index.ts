import { NextFunction, Response, Request } from "express";
import { check, validationResult, ValidationError } from "express-validator";
import { authenticateToken } from "./auth";
import mongoose from "mongoose";

export const taskValidator = [
  check("title")
    .isString()
    .withMessage("Title must be a string")
    .notEmpty()
    .withMessage("Title cannot be empty"),
  check("description")
    .isString()
    .withMessage("Description must be a string")
    .notEmpty()
    .withMessage("Description cannot be empty"),
  check("points").isNumeric().withMessage("Points must be a number"),
  check("projectId")
    .notEmpty()
    .withMessage("projectId is required")
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error("Invalid projectId format");
      }
      return true;
    }),
];

export const projectValidator = [
  check("name")
    .isString()
    .withMessage("Name must be a string")
    .notEmpty()
    .withMessage("Name cannot be empty"),
  check("description")
    .isString()
    .withMessage("Description must be a string")
    .notEmpty()
    .withMessage("Description cannot be empty"),
  check("numberOfParticipants")
    .isNumeric()
    .withMessage("numberOfParticipants must be a number")
    .isInt({ min: 1 })
    .withMessage("numberOfParticipants must be at least 1"),
  check("socials")
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
        } catch (error: any) {
          throw new Error(error.message || "Invalid socials format");
        }
      }
      return true;
    }),
];

export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors
      .array()
      .map((err: ValidationError) => err.msg);
    const errorMessage = formattedErrors.join(", ");
    return res.status(400).json({ status: false, message: errorMessage });
  }
  next();
};

export { authenticateToken };
