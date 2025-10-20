import { Request, Response } from "express";
import User from "../model/user.model";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const checkPasswordStatus = async (req: Request, res: Response) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ hasPassword: false, message: "Username is required" });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ hasPassword: false, message: "User not found" });
    }
    
    return res.status(200).json({ 
      hasPassword: user.hasPassword,
      message: user.hasPassword ? "User has password set" : "User needs to create password"
    });
  } catch (error) {
    console.error("Error checking password status:", error);
    return res.status(500).json({ hasPassword: false, message: "Internal server error" });
  }
};

export const createPassword = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ 
      message: "Username and password are required" 
    });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ 
        message: "User not found" 
      });
    }

    if (user.hasPassword) {
      return res.status(400).json({ 
        message: "User already has a password set" 
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user with password and hasPassword flag
    await User.updateOne(
      { username },
      { 
        password: hashedPassword,
        hasPassword: true
      }
    );

    // Generate JWT token after password creation
    const token = jwt.sign(
      { 
        id: user._id, 
        username: user.username,
        isAdmin: user.isAdmin 
      },
      process.env.JWT_SECRET || "secret",
      {
        expiresIn: "24h",
      }
    );

    return res.status(200).json({
      token,
      message: "Password created successfully"
    });
  } catch (error) {
    console.error("Error creating password:", error);
    return res.status(500).json({ 
      message: "Internal server error" 
    });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ 
      message: "Username and password are required" 
    });
  }

  try {
    const user = await User.findOne({ username }).select("+password");
    if (!user) {
      return res.status(404).json({ 
        message: "User not found" 
      });
    }

    if (!user.hasPassword) {
      return res.status(400).json({ 
        message: "User has not set a password yet" 
      });
    }

    // Compare password
    const isPasswordCorrect = await bcrypt.compare(password, user.password!);
    if (!isPasswordCorrect) {
      return res.status(401).json({ 
        message: "Invalid credentials" 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id, 
        username: user.username,
        isAdmin: user.isAdmin 
      },
      process.env.JWT_SECRET || "secret",
      {
        expiresIn: "24h",
      }
    );

    return res.status(200).json({
      token,
      message: "Login successful"
    });
  } catch (error) {
    console.error("Error logging in user:", error);
    return res.status(500).json({ 
      message: "Internal server error" 
    });
  }
};

export const verifyToken = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ 
      message: "No token provided" 
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
        message: "User not found" 
      });
    }

    return res.status(200).json({
      message: "Token is valid",
      user: {
        id: user._id,
        username: user.username,
        firstName: user.firstName,
        walletAddress: user.walletAddress,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    console.error("Error verifying token:", error);
    return res.status(401).json({ 
      message: "Invalid token" 
    });
  }
};