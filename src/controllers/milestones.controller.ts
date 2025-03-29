import Point from "../model/points.model";
import Milestone from "../model/milestones.model";
import User from "../model/user.model";
import { Request, Response } from "express";
import mongoose from "mongoose";

export const createMilestone = async (req: Request, res: Response) => {
  try {
    const { count, points } = req.body;

    if (!count || !points) {
      res.status(400).json({
        status: false,
        message: "Count and Points are required.",
      });
    } else {
      const milestone = new Milestone({ count, points });

      await milestone.save();
      res.status(201).json({
        message: "Milestone created successfully",
        status: true,
      });
    }
  } catch (error) {
    res.status(500).json({ error: error, status: false });
  }
};





export const getUserMileStones = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    // Fetch the user and populate completed milestones
    const user = await User.findOne({ username })
      .populate("milestonesCompleted")
      .lean();

     

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Extract completed milestones
    const completedMilestones = user.milestonesCompleted || [];
    const completedMilestoneIds = completedMilestones.map(
      (milestone: any) => milestone._id
    );


    // // Fetch all milestones
    const allMilestones = await Milestone.find().lean();

    if (!allMilestones.length) {
      return res.status(404).json({ status: false, message: "No milestones found" });
    }

    // Map through all milestones and determine if each is claimed
    const milestonesWithStatus = allMilestones.map((milestone: any) => ({
      ...milestone,
      claimed: completedMilestoneIds.toString().includes(milestone._id),
    }));


    return res.status(200).json({
      status: true,
      milestones: milestonesWithStatus,
      message: "User milestones fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching user milestones:", error);
    return res.status(500).json({ status: false, message: "Internal server error", error: error.message });
  }
};


export const completeMilestone = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { username, milestoneId } = req.body;

    // Validate request body
    if (!username || !milestoneId) {
      return res.status(400).json({ status: false, message: "Invalid data provided" });
    }

    // Fetch the user
    const user = await User.findOne({ username }).session(session);
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Fetch the user's points
    const points = await Point.findOne({ userId: user._id }).session(session);
    if (!points) {
      return res.status(404).json({ status: false, message: "Points record not found" });
    }

    // Fetch the milestone
    const milestone = await Milestone.findById(milestoneId).session(session);
    if (!milestone) {
      return res.status(404).json({ status: false, message: "Milestone not found" });
    }

    // Check if the milestone has already been completed
    if (user.milestonesCompleted.includes(milestone._id)) {
      return res.status(400).json({ status: false, message: "Milestone already completed" });
    }

    // Update milestones and points
    user.milestonesCompleted.push(milestone._id);
    const updatedPoints = points.points + milestone.points;

    await Point.findByIdAndUpdate(points._id, { points: updatedPoints }, { session });
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: true,
      message: "Milestone completed successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ status: false, message: "Internal server error", error: error.message });
  }
};

