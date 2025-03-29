import Point from "../model/points.model";
import Boosts from "../model/boosts.model";
import User from "../model/user.model";
import { Request, Response } from "express";
import mongoose from "mongoose";

export const createBoost = async (req: Request, res: Response) => {
  try {
    const { count, points } = req.body;

    if (!count || !points) {
      res.status(400).json({
        status: false,
        message: "Count and Points are required.",
      });
    } else {
      const boost = new Boosts({ count, points });

      await boost.save();
      res.status(201).json({
        message: "Boosts created successfully",
        status: true,
      });
    }
  } catch (error) {
    res.status(500).json({ error: error, status: false });
  }
};

export const getBoosts = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username }).populate("userBoosts").lean();

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const userBoosts = user.userBoosts || [];
    const userBoostIds = userBoosts.map((boost: any) => boost._id);

    const allBoosts = await Boosts.find().lean();

    if (!allBoosts.length) {
      return res
        .status(404)
        .json({ status: false, message: "No boosts found" });
    }

    const boosts = allBoosts.map((boost: any) => ({
      ...boost,
      owned: userBoostIds.toString().includes(boost._id),
    }));

    res.status(200).json({
      status: true,
      data: boosts,
      message: "Bossts fetched successfully",
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: error, status: false, message: "An error occurred" });
  }
};

export const purchaseBoost = async (req: Request, res: Response) => {
  try {
    const { username, boostId } = req.body;

    const user = await User.findOne({ username }).populate("userBoosts");
    const boost = await Boosts.findById(boostId);

    if (!user || !boost) {
      return res
        .status(404)
        .json({ status: false, message: "User or Boost not found" });
    }

    const userBoosts = user.userBoosts || [];

    const userBoostIds = userBoosts.map((boost: any) => boost._id);
    console.log(userBoostIds);

    if (userBoostIds.toString().includes(boostId)) {
      return res
        .status(400)
        .json({ status: false, message: "Boost already owned" });
    }

    // if (userPoints.points < boost.points) {
    //     return res.status(400).json({ status: false, message: "Insufficient points" });
    // }

    // userPoints.points -= boost.points;
    user.userBoosts.push(boostId);

    await user.save();
    // await userPoints.save();

    // await User.findByIdAndUpdate(user._id, user);

    res
      .status(200)
      .json({ status: true, message: "Boost purchased successfully"});
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: error, status: false, message: "An error occurred" });
  }
};
