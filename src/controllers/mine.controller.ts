import { Request, Response } from "express";
import Mining from "../model/mining.model";
import User from "../model/user.model";
import Point from "model/points.model";

// Points rewarded after 24hrs
const REWARD_POINTS = 50;

export const startMining = async (req: Request, res: Response) => {
  const { username } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ status: false, error: "User not found" });

    let mining = await Mining.findOne({ user: user._id });
    if (!mining) {
      mining = new Mining({ user: user._id });
    }

    if (mining.isMining) {
      return res.status(400).json({ status: false, message: "Already mining" });
    }

    mining.miningStartedAt = new Date();
    mining.isMining = true;
    await mining.save();

    return res.status(200).json({ status: true, data: {}, message: "Mining started" });
  } catch (err) {
    console.error("Start mining error:", err);
    return res.status(500).json({ status: false, error: "Internal server error" });
  }
};

export const claimMining = async (req: Request, res: Response) => {
  const { username } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ status: false, error: "User not found" });

    const mining = await Mining.findOne({ user: user._id });
    if (!mining || !mining.isMining) {
      return res.status(400).json({ status: false, message: "Mining not started" });
    }

    const now = new Date();
    const started = new Date(mining.miningStartedAt as Date);
    const diffInMs = now.getTime() - started.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);

    if (diffInHours < 24) {
      const hoursLeft = (24 - diffInHours).toFixed(2);
      return res.status(400).json({ status: false, message: `${hoursLeft} hours left to claim` });
    }

    const points = await Point.findOne({userId: user.id});
    if (!points) {
      return res.status(404).json({ status: false, message: "Points record not found" });
    }
    // Add points to user's points record
    points.points += REWARD_POINTS;
    await points.save();

    // Add points to user
    // user.points = (user.points || 0) + REWARD_POINTS;
    // await user.save();

    // Reset mining state
    mining.isMining = false;
    mining.lastClaimedAt = now;
    mining.miningStartedAt = null;
    await mining.save();

    return res.status(200).json({ status: true, message: `You earned ${REWARD_POINTS} points!` });
  } catch (err) {
    console.error("Claim mining error:", err);
    return res.status(500).json({ status: false, error: "Internal server error" });
  }
};
