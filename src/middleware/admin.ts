import { Request, Response, NextFunction } from "express";
import User from "../model/user.model";

export const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const { username } = req.headers;

  if (!username) {
    return res.status(401).json({ message: "Unauthorized: Username not provided" });
  }

  try {
    const user = await User.findOne({ username });
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: "Forbidden: User is not an admin" });
    }
    next();
  } catch (error) {
    console.error("Error in isAdmin middleware:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
