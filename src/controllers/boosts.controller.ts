import Point from "../model/points.model";
import Boosts from "../model/boosts.model";
import User from "../model/user.model";
import { Request, Response } from "express";
import mongoose from "mongoose";

export const createBoost = async (req: Request, res: Response) => {
  try {
    const { count, points } = req.body;

    if (!count || !points) {
      return res.status(400).json({
        message: "Count and Points are required.",
      });
    }

    const boost = new Boosts({ count, points });
    await boost.save();

    return res.status(201).json({
      message: "Boost created successfully",
    });
  } catch (error) {
    console.error("Error creating boost:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getBoosts = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username }).select("userBoosts").lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userBoostIds = new Set(user.userBoosts.map(id => id.toString()));
    const allBoosts = await Boosts.find().lean();

    const boosts = allBoosts.map((boost) => ({
      ...boost,
      owned: userBoostIds.has(boost._id.toString()),
    }));

    return res.status(200).json({
      data: boosts,
      message: "Boosts fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching boosts:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const purchaseBoost = async (req: Request, res: Response) => {
  const { username, boostId } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findOne({ username }).session(session);
    const boost = await Boosts.findById(boostId).session(session);

    if (!user || !boost) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User or Boost not found" });
    }

    if (user.userBoosts.includes(boost._id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Boost already owned" });
    }

    const points = await Point.findOne({ userId: user._id }).session(session);
    if (!points || points.points < boost.points) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Insufficient points" });
    }

    points.points -= boost.points;
    user.userBoosts.push(boost._id);

    await user.save({ session });
    await points.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ message: "Boost purchased successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error purchasing boost:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
