import { Request, Response } from "express";
import Mining from "../model/mining.model";
import User from "../model/user.model";
import Point from "../model/points.model";
import mongoose from "mongoose";

const REWARD_POINTS = 50;
const MINING_DURATION_HOURS = 24;

export const startMining = async (req: Request, res: Response) => {
  const { username } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let mining = await Mining.findOne({ user: user._id });
    if (!mining) {
      mining = new Mining({ user: user._id });
    }

    if (mining.isMining) {
      return res.status(400).json({ message: "Already mining" });
    }

    mining.miningStartedAt = new Date();
    mining.isMining = true;
    await mining.save();

    return res.status(200).json({ message: "Mining started" });
  } catch (err) {
    console.error("Start mining error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const claimMining = async (req: Request, res: Response) => {
  const { username } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    const mining = await Mining.findOne({ user: user._id }).session(session);
    if (!mining || !mining.isMining) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Mining not started" });
    }

    const now = new Date();
    const started = new Date(mining.miningStartedAt as Date);
    const diffInMs = now.getTime() - started.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);

    if (diffInHours < MINING_DURATION_HOURS) {
      const hoursLeft = (MINING_DURATION_HOURS - diffInHours).toFixed(2);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: `${hoursLeft} hours left to claim` });
    }

    const points = await Point.findOne({ userId: user._id }).session(session);
    if (!points) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Points record not found" });
    }

    points.points += REWARD_POINTS;
    await points.save({ session });

    mining.isMining = false;
    mining.lastClaimedAt = now;
    mining.miningStartedAt = null;
    await mining.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ message: `You earned ${REWARD_POINTS} points!` });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Claim mining error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
