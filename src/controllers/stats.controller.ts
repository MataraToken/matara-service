import { Request, Response } from "express";
import User from "../model/user.model";
import Task from "../model/task.model";
import Point from "../model/points.model";

export const getSummary = async (req: Request, res: Response) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalTasks = await Task.countDocuments();
    
    

    // Count users who have completed at least one task
    const usersWithCompletedTasks = await User.countDocuments({ tasksCompleted: { $exists: true, $ne: [] } });
    
    // Calculate the total number of completed tasks across all users
    const usersAggregation = await User.aggregate([
      { $project: { completedTasksCount: { $size: { $ifNull: ["$tasksCompleted", []] } } } },
      { $group: { _id: null, totalCompletedTasks: { $sum: "$completedTasksCount" } } }
    ]);
    
    const totalCompletedTasks = usersAggregation.length > 0 ? usersAggregation[0].totalCompletedTasks : 0;

    res.status(200).json({
      data: {
        totalUsers,
        totalTasks,
        totalCompletedTasks,
        usersWithCompletedTasks,
      },
      message: "Summary fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching summary:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const topUsers = await Point.find()
      .sort({ points: -1 })
      .limit(5)
      .populate("userId", "username profilePicture");

    res.status(200).json({
      data: topUsers,
      message: "Leaderboard fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};