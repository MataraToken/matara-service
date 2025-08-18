import { Request, Response } from "express";
import User from "../model/user.model";

export const authenticateUser = async (req: Request, res: Response) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ status: false, message: "Username is required" });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }
    return res.status(200).json({ status: true, message: "User authenticated successfully" });
  } catch (error) {
    console.error("Error authenticating user:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};