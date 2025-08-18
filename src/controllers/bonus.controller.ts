import User from "../model/user.model";
import Bonus from "../model/bonus.model";
import { Request, Response } from "express";
import Point from "../model/points.model";
import mongoose from "mongoose";

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

export const checkBonusStatus = async (req: Request, res: Response) => {
  const { username } = req.params;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const loginBonus = await Bonus.findOne({ userId: user._id });

    if (!loginBonus) {
      return res.status(200).json({
        isEligible: true,
        loginStreak: 0,
      });
    }

    const currentTime = new Date();
    const lastLoginTime = new Date(loginBonus.lastLogin);
    const timeDifference = currentTime.getTime() - lastLoginTime.getTime();

    const isEligible = timeDifference >= MILLISECONDS_IN_A_DAY;

    return res.status(200).json({
      isEligible,
      loginStreak: loginBonus.loginStreak,
    });
  } catch (error) {
    console.error("Error checking bonus status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const collectBonus = async (req: Request, res: Response) => {
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

    const points = await Point.findOne({ userId: user._id }).session(session);
    if (!points) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Points not found" });
    }

    let loginBonus = await Bonus.findOne({ userId: user._id }).session(session);

    const currentTime = new Date();

    if (loginBonus) {
      const lastLoginTime = new Date(loginBonus.lastLogin);
      const timeDifference = currentTime.getTime() - lastLoginTime.getTime();

      if (timeDifference < MILLISECONDS_IN_A_DAY) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Bonus already collected for today." });
      }

      if (timeDifference >= MILLISECONDS_IN_A_DAY * 2) {
        loginBonus.loginStreak = 0;
      }

      loginBonus.loginStreak += 1;
      loginBonus.lastLogin = currentTime;
    } else {
      loginBonus = new Bonus({
        userId: user._id,
        lastLogin: currentTime,
        loginStreak: 1,
      });
    }

    const bonusPoints = calculateBonus(loginBonus.loginStreak);
    points.points += bonusPoints;

    await loginBonus.save({ session });
    await points.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "Bonus collected successfully!",
      loginStreak: loginBonus.loginStreak,
      bonusPoints,
      totalPoints: points.points,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error collecting bonus:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const calculateBonus = (streak: number): number => {
  if (streak === 0) return 1000;
  const baseBonus = 1000;
  const additionalBonus = 1000 * (streak - 1);
  return baseBonus + additionalBonus;
};
