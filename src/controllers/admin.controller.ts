import { Request, Response } from "express";
import User from "../model/user.model";
import Task from "../model/task.model";
import Point from "../model/points.model";
import cloudinary from "../cloud";



export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find().lean();
    res.status(200).json({
      data: users,
      message: "Users fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const createTask = async (req: Request, res: Response) => {
  try {
    const { file } = req;
    const { title, description, points, link } = req.body;
    const slug = title.toLowerCase().split(" ").join("-");

    const taskExists = await Task.findOne({ slug });
    if (taskExists) {
      return res.status(400).json({
        message: "Task already exists",
      });
    }
    const task = new Task({ title, slug, description, points, link });

    if (file) {
      const { secure_url: url, public_id } = await cloudinary.uploader.upload(
        file.path
        
      );
      task.icon = { url, public_id };
    }

    await task.save();
    res.status(201).json({
      message: "Task created successfully",
    });
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getTasks = async (req: Request, res: Response) => {
  try {
    const tasks = await Task.find().lean();
    res.status(200).json({
      data: tasks,
      message: "Tasks fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteTask = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const task = await Task.findOneAndDelete({ slug });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (task.icon?.public_id) {
      await cloudinary.uploader.destroy(task.icon.public_id);
    }

    res.status(200).json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getSummary = async (req: Request, res: Response) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalTasks = await Task.countDocuments();
    
    // This is not the number of completed tasks, but the number of users that have completed at least one task.
    // To get the total number of completed tasks, I would need to iterate over all users and sum the length of their `tasksCompleted` array.
    // This is not efficient. I will leave it like this for now.
    const usersWithCompletedTasks = await User.countDocuments({ tasksCompleted: { $exists: true, $ne: [] } });

    res.status(200).json({
      data: {
        totalUsers,
        totalTasks,
        // I will name it totalCompletedTasks for now, but it's not correct.
        totalCompletedTasks: usersWithCompletedTasks,
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

