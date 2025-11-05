import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../model/user.model";

export const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret") as { 
      id: string; 
      isAdmin: boolean;
      username?: string;
    };

    if (!decoded.isAdmin) {
      return res.status(403).json({ message: "Forbidden: User is not an admin" });
    }

    // Get user to get username if not in token
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized: User not found" });
    }

    // Add user info to request object
    req.user = {
      id: decoded.id,
      username: decoded.username || user.username,
      isAdmin: decoded.isAdmin,
    };

    next();
  } catch (error) {
    console.error("Error in isAdmin middleware:", error);
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};
