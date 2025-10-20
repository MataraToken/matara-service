import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../model/user.model";

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ 
      status: false, 
      message: "Unauthorized: No token provided" 
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret") as { 
      id: string; 
      username: string; 
      isAdmin: boolean 
    };

    // Optionally verify user still exists
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ 
        status: false, 
        message: "Unauthorized: User not found" 
      });
    }

    // Add user info to request object
    req.user = {
      id: decoded.id,
      username: decoded.username,
      isAdmin: decoded.isAdmin
    };

    next();
  } catch (error) {
    console.error("Error in authenticateToken middleware:", error);
    return res.status(401).json({ 
      status: false, 
      message: "Unauthorized: Invalid token" 
    });
  }
};

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        isAdmin: boolean;
      };
    }
  }
}
