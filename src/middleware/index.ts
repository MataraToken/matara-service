import { NextFunction, Response, Request } from "express";
import { check, validationResult, ValidationError } from "express-validator";
import { authenticateToken } from "./auth";

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
