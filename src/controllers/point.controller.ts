import User from "../model/user.model";
import Point from "../model/points.model";
import { PointsTypes } from "../types";
import { Request, Response } from "express";

export const addPoints = async (message: PointsTypes) => {
  const { points, username } = message;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      console.error("User not found");
      return;
    }

    await Point.updateOne({ userId: user._id }, { $inc: { points: points } }, { upsert: true });
    console.log("Points updated successfully");
  } catch (error) {
    console.error("Error adding points:", error);
  }
};

export const saveTimeStamps = async (message) => {
  const { username, timestamp } = message;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      console.error("User not found");
      return;
    }
    await Point.updateOne({ userId: user._id }, { energyStamp: timestamp });
  } catch (error) {
    console.error("Error saving timestamp:", error);
  }
};

export const getUserPoint = async (req: Request, res: Response) => {
  const { username } = req.query;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const points = await Point.findOne({ userId: user._id });
    return res.status(200).json({
      data: points,
      message: "Points fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching user points:", error);
    return res.status(500).json({
      message: "An error occurred while fetching points",
    });
  }
};

export const getLeaderBoard = async (req: Request, res: Response) => {
  try {
    const leaderboard = await Point.find()
      .sort({ points: -1 })
      .limit(50)
      .populate("userId", "username profilePicture level")
      .lean();

    const result = leaderboard.map((entry) => ({
      user: entry.userId,
      points: entry.points,
    }));

    return res.status(200).json({
      data: result,
      message: "Leaderboard fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return res.status(500).json({
      message: "An error occurred while fetching the leaderboard",
    });
  }
};
