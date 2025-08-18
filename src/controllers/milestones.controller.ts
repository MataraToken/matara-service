import Point from "../model/points.model";
import Milestone from "../model/milestones.model";
import User from "../model/user.model";
import { Request, Response } from "express";
import mongoose from "mongoose";

export const createMilestone = async (req: Request, res: Response) => {
  try {
    const { count, points } = req.body;

    if (!count || !points) {
      return res.status(400).json({
        message: "Count and Points are required.",
      });
    }

    const milestone = new Milestone({ count, points });
    await milestone.save();

    return res.status(201).json({
      message: "Milestone created successfully",
    });
  } catch (error) {
    console.error("Error creating milestone:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserMileStones = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username })
      .select("milestonesCompleted")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const completedMilestoneIds = new Set(
      user.milestonesCompleted.map((id) => id.toString())
    );
    const allMilestones = await Milestone.find().lean();

    const milestonesWithStatus = allMilestones.map((milestone) => ({
      ...milestone,
      claimed: completedMilestoneIds.has(milestone._id.toString()),
    }));

    return res.status(200).json({
      milestones: milestonesWithStatus,
      message: "User milestones fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching user milestones:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const completeMilestone = async (req: Request, res: Response) => {
  const { username, milestoneId } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findOne({ username }).session(session);
    const milestone = await Milestone.findById(milestoneId).session(session);

    if (!user || !milestone) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User or Milestone not found" });
    }

    if (user.milestonesCompleted.includes(milestone._id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Milestone already completed" });
    }

    const points = await Point.findOne({ userId: user._id }).session(session);
    if (!points) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Points not found" });
    }

    user.milestonesCompleted.push(milestone._id);
    points.points += milestone.points;

    await user.save({ session });
    await points.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "Milestone completed successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error completing milestone:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

