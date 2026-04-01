import { generateReferralCode, generateBSCWallet, encryptPrivateKey } from "../utils";
import User from "../model/user.model";
import { Request, Response } from "express";
import Point from "../model/points.model";
import mongoose from "mongoose";
import { getAllSupportedTokens } from "../config/tokens";

/** Accepts number or string from JSON; rejects non-integers. */
function parseTelegramChatId(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

export const registerUser = async (req: Request, res: Response) => {
  const { username, referralCode, premium, profilePicture, firstName, telegramChatId } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const alreadyExists = await User.findOne({ username }).session(session);
    if (alreadyExists) {
      await session.abortTransaction();
      session.endSession();
      const tid = parseTelegramChatId(telegramChatId);
      if (tid != null) {
        await User.updateOne({ username }, { $set: { telegramChatId: tid } });
      }
      return res.status(200).json({ message: "Username already exists" });
    }

    const newReferralId = generateReferralCode();
    const parsedChatId = parseTelegramChatId(telegramChatId);

    // Generate BSC wallet for the user
    const wallet = generateBSCWallet();
    const encryptionPassword = process.env.WALLET_ENCRYPTION_PASSWORD || 'default-encryption-key';
    const encryptedPrivateKey = encryptPrivateKey(wallet.privateKey, encryptionPassword);

    const newUser = new User({
      username,
      referralCode: newReferralId,
      premium,
      profilePicture,
      firstName,
      walletAddress: wallet.address,
      encryptedPrivateKey,
      ...(parsedChatId != null ? { telegramChatId: parsedChatId } : {}),
    });

    const initialPoints = 100;
    const additionalPoints = 50;
    const newPoints = new Point({
      userId: newUser._id,
      points: initialPoints,
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
      walletAddress: wallet.address,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error registering user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Called by the Telegram bot on any private chat activity so existing app users
 * get `telegramChatId` stored even if they never hit /start again (or already existed before).
 * Does not create users — only updates a row that matches `username`.
 */
export const syncTelegramChatFromBot = async (req: Request, res: Response) => {
  try {
    const { username, telegramChatId } = req.body;
    if (typeof username !== "string" || !username.trim()) {
      return res.status(400).json({ message: "username is required" });
    }
    const tid = parseTelegramChatId(telegramChatId);
    if (tid == null) {
      return res.status(400).json({ message: "telegramChatId is required" });
    }

    const result = await User.updateOne(
      { username: username.trim() },
      { $set: { telegramChatId: tid } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Telegram chat id stored",
      updated: result.modifiedCount > 0,
    });
  } catch (error) {
    console.error("syncTelegramChatFromBot error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get user by username (public endpoint - can look up any user)
 */
export const getUser = async (req: Request, res: Response) => {
  const { username } = req.query;
  try {
    const user = await User.findOne({ username }).lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userPoints = await Point.findOne({ userId: user._id }).lean();

    const { userBoosts, tasksCompleted, milestonesCompleted, referrals, encryptedPrivateKey, ...filteredUser } = user;

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

/**
 * Get current authenticated user's info (uses JWT)
 */
export const getCurrentUser = async (req: Request, res: Response) => {
  // Get user from JWT token (set by authenticateToken middleware)
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized: User not authenticated" });
  }

  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userPoints = await Point.findOne({ userId: user._id }).lean();

    const { userBoosts, tasksCompleted, milestonesCompleted, referrals, encryptedPrivateKey, ...filteredUser } = user;

    const mergedData = { ...filteredUser, ...userPoints };

    return res.status(200).json({
      data: mergedData,
      message: "Current user fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching current user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getReferredUsers = async (req: Request, res: Response) => {
  const { username } = req.query;

  try {
    const user = await User.findOne({ username }).populate(
      "referrals",
      "username profilePicture premium walletAddress"
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
      points: pointsMap.get(referral._id.toString()) || 50,
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

export const userRanking = async (req: Request, res: Response) => {
  try {
    const users = await User.find({}, 'username walletAddress').lean();
    const userIds = users.map(user => user._id);
    
    const points = await Point.find({ userId: { $in: userIds } }, 'userId points').lean();
    const pointsMap = new Map(points.map(p => [p.userId.toString(), p.points]));
    
    const userRankings = users.map(user => ({
      username: user.username,
      walletAddress: user.walletAddress,
      totalEarnings: pointsMap.get(user._id.toString()) || 0
    }))
    .sort((a, b) => b.totalEarnings - a.totalEarnings);

    return res.status(200).json({
      data: userRankings,
      message: "User rankings fetched successfully"
    });
  } catch (error) {
    console.error("Error fetching user rankings:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find().select('-encryptedPrivateKey').lean();
    res.status(200).json({
      data: users,
      message: "Users fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const topUsers = await Point.find()
      .sort({ points: -1 })
      .limit(5)
      .populate("userId", "username profilePicture walletAddress");

    res.status(200).json({
      data: topUsers,
      message: "Leaderboard fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get list of supported tokens for send, receive, and swap operations
 */
export const getSupportedTokens = async (req: Request, res: Response) => {
  try {
    const tokens = getAllSupportedTokens();
    res.status(200).json({
      data: tokens,
      message: "Supported tokens fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching supported tokens:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
