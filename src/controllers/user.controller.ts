



import { generateReferralCode } from "../utils";
import User from "../model/user.model";
import { Request, Response } from "express";
import Point from "../model/points.model";
import mongoose from "mongoose";

export const registerUser = async (req: Request, res: Response) => {
  const { username, referralCode, premium, profilePicture, firstName } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const alreadyExists = await User.findOne({ username }).session(session);
    if (alreadyExists) {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({ message: "Username already exists" });
    }

    const newReferralId = generateReferralCode();
    const newUser = new User({
      username,
      referralCode: newReferralId,
      premium,
      profilePicture,
      firstName,
    });

    const initialPoints = 30000;
    const additionalPoints = 1000;
    const newPoints = new Point({
      userId: newUser._id,
      points: initialPoints + additionalPoints,
    });

    if (referralCode) {
      const referredBy = await User.findOne({ referralCode }).session(session);
      if (referredBy) {
        referredBy.referrals.push(newUser._id);
        await Point.updateOne({ userId: referredBy._id }, { $inc: { points: additionalPoints } }).session(session);
        await referredBy.save({ session });
      }
    }

    await newUser.save({ session });
    await newPoints.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: "User registered successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error registering user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getUser = async (req: Request, res: Response) => {
  const { username } = req.query;
  try {
    const user = await User.findOne({ username }).lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userPoints = await Point.findOne({ userId: user._id }).lean();

    const { userBoosts, tasksCompleted, milestonesCompleted, referrals, ...filteredUser } = user;

    const mergedData = { ...filteredUser, ...userPoints };

    return res.status(200).json({
      data: mergedData,
      message: "User Fetched Successfully",
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getReferredUsers = async (req: Request, res: Response) => {
  const { username } = req.query;

  try {
    const user = await User.findOne({ username }).populate(
      "referrals",
      "username profilePicture premium"
    ).lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const referrals = user.referrals;
    const referralIds = referrals.map((ref: any) => ref._id);

    const points = await Point.find({ userId: { $in: referralIds } }).lean();
    const pointsMap = new Map(points.map(p => [p.userId.toString(), p.points]));

    const referralsWithPoints = referrals.map((referral: any) => ({
      ...referral,
      points: pointsMap.get(referral._id.toString()) || 30000,
    }));

    return res.status(200).json({
      data: referralsWithPoints,
      message: "Referrals Fetched Successfully",
    });
  } catch (error) {
    console.error("Error getting referred users:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const saveOnboarding = async (req: Request, res: Response) => {
  const { username } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    user.onboarding = true;
    await user.save();
    return res.status(200).json({
      message: "Onboarding status updated successfully",
    });
  } catch (error) {
    console.error("Error saving onboarding:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};








