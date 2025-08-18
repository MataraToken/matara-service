import { Request, Response } from "express";
import Task from "../model/task.model";
import User from "../model/user.model";
import cloudinary from "../cloud";
import mongoose from "mongoose";
import Point from "../model/points.model";

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

export const getUserTasks = async (req: Request, res: Response) => {
  const { username } = req.params;
  try {
    const user = await User.findOne({ username }).select("tasksCompleted").lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const completedTaskIds = new Set(user.tasksCompleted.map(id => id.toString()));

    const allTasks = await Task.find().lean();

    const tasksWithCompletionStatus = allTasks.map((task) => ({
      ...task,
      completed: completedTaskIds.has(task._id.toString()),
    }));

    res.status(200).json({
      data: tasksWithCompletionStatus,
      message: "Tasks fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching user tasks:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getTask = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const task = await Task.findOne({ slug });
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    res.status(200).json({ task, message: "Task fetched successfully" });
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateTask = async (req: Request, res: Response) => {
  try {
    const { title, description, points, link } = req.body;
    const { slug } = req.params;
    const { file } = req;

    const task = await Task.findOne({ slug });
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (file) {
      if (task.icon?.public_id) {
        await cloudinary.uploader.destroy(task.icon.public_id);
      }
      const { secure_url: url, public_id } = await cloudinary.uploader.upload(
        file.path
      );
      task.icon = { url, public_id };
    }

    task.title = title ?? task.title;
    task.description = description ?? task.description;
    task.points = points ?? task.points;
    task.link = link ?? task.link;

    const updated = await task.save();
    res.status(200).json({
      task: updated,
      message: "Task updated successfully",
    });
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const completeTask = async (req: Request, res: Response) => {
  const { slug } = req.params;
  const { username } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const task = await Task.findOne({ slug }).session(session);
    if (!task) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Task not found" });
    }

    const user = await User.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    if (user.tasksCompleted.includes(task._id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Task already completed" });
    }

    const points = await Point.findOne({ userId: user._id }).session(session);
    if (!points) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Points not found" });
    }

    user.tasksCompleted.push(task._id);
    points.points += task.points;

    await user.save({ session });
    await points.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: "Task completed successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error completing task:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
