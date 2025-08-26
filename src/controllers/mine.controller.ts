import { Request, Response } from "express";
import Mining from "../model/mining.model";
import User from "../model/user.model";
import Point from "../model/points.model";
import mongoose from "mongoose";

const REWARD_POINTS = 50;
const MINING_DURATION_HOURS = 24;

export const startMining = async (req: Request, res: Response) => {
  const { username } = req.query;

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

    return res.status(200).json({
      data: mining,
      message: "Mining started",
    });
  } catch (err) {
    console.error("Start mining error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const claimMining = async (req: Request, res: Response) => {
  const { username, mineCount } = req.body;

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
      return res
        .status(400)
        .json({ message: `${hoursLeft} hours left to claim` });
    }

    const points = await Point.findOne({ userId: user._id }).session(session);
    if (!points) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Points record not found" });
    }

    points.points += Number(mineCount);
    await points.save({ session });

    mining.isMining = false;
    mining.lastClaimedAt = now;
    mining.miningStartedAt = null;
    await mining.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res
      .status(200)
      .json({ message: `You earned ${mineCount} points!` });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Claim mining error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const miningState = async (req: Request, res: Response) => { 
  const { username } = req.query;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const mining = await Mining.findOne({ user: user._id });
    const points = await Point.findOne({ userId: user._id });

    if (!points) {
      return res.status(404).json({ message: "Points record not found" });
    }

    if (!mining) {
      return res.status(200).json({
        isMining: false,
        timeLeft: 0,
        progress: 0,
        earnedPoints: 0,
        totalPoints: points.points,
        canClaim: false,
        lastClaimed: null,
      });
    }

    if (!mining.isMining) {
      return res.status(200).json({
        isMining: false,
        timeLeft: 0,
        progress: 0,
        earnedPoints: 0,
        totalPoints: points.points,
        canClaim: false,
        lastClaimed: mining.lastClaimedAt,
      });
    }

    const now = new Date();
    const started = new Date(mining.miningStartedAt as Date);
    const diffInMs = now.getTime() - started.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);

    const progress = Math.min((diffInHours / MINING_DURATION_HOURS) * 100, 100);
    const timeLeft = Math.max(MINING_DURATION_HOURS - diffInHours, 0);
    const canClaim = diffInHours >= MINING_DURATION_HOURS;
    const earnedPoints = canClaim
      ? REWARD_POINTS
      : Math.floor((diffInHours / MINING_DURATION_HOURS) * REWARD_POINTS);

    return res.status(200).json({
      isMining: true,
      timeLeft: parseFloat(timeLeft.toFixed(2)),
      progress: parseFloat(progress.toFixed(2)),
      earnedPoints,
      totalPoints: points.points,
      canClaim,
      miningStartedAt: mining.miningStartedAt,
      lastClaimed: mining.lastClaimedAt,
    });
  } catch (err) {
    console.error("Mining state error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
