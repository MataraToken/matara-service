import { Request, Response } from "express";
import Task from "../model/task.model";
import User from "../model/user.model";
import cloudinary from "../cloud";

export const createTask = async (req: Request, res: Response) => {
  try {
    const { file } = req ;
    const { title, description, points, link } = req.body;
    const slug = title.toLowerCase().split(" ").join("-");

    const taskExists = await Task.findOne({ slug });
    if (taskExists) {
      return res.status(400).json({
        message: "Task already exists",
        status: false,
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
      status: true,
    });
  } catch (error) {
    res.status(500).json({ error: error, status: false });
  }
};

export const getUserTasks = async (req: Request, res: Response) => {
  const { username } = req.params;
  try {
    const user = await User.findOne({ username })
      .populate("tasksCompleted")
      .lean();
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const completedTasks = user.tasksCompleted as any[];
    const completedTaskIds = completedTasks.map((task) => task._id);

    // Fetch undone tasks
    let undoneTasks = await Task.find({ _id: { $nin: completedTaskIds } })
      .select("-createdAt -updatedAt -__v")
      .lean();

    // Check if the number of undone tasks is less than 5
    if (undoneTasks.length < 5) {
      // Calculate how many completed tasks are needed
      const remainingTasksNeeded = 5 - undoneTasks.length;

      // Fetch the necessary completed tasks
      const additionalTasks = completedTasks
        .slice(0, remainingTasksNeeded)
        .map((task) => ({
          ...task,
          completed: true,
        }));

      // Add the necessary completed tasks to the undone tasks
      undoneTasks = undoneTasks.concat(additionalTasks);
    }

    // Include a "completed: false" field for undone tasks
    const tasksWithCompletionStatus = undoneTasks.map((task) => ({
      ...task,
      completed: completedTaskIds.includes(task._id) ? true : false,
    }));

    res.status(200).json({
      data: tasksWithCompletionStatus,
      status: true,
      message: "Tasks fetched successfully",
    });
  } catch (error) {
    res.status(500).json({ error: error.message, status: false });
  }
};

export const getTask = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const task = await Task.findOne({ slug });
    if (!task) {
      return res.status(404).json({ message: "Task not found", status: false });
    }
    res
      .status(200)
      .json({ task, status: true, message: "Task fetched successfully" });
  } catch (error) {
    res.status(500).json({ error: error, status: false });
  }
};

export const updateTask = async (req: Request, res: Response) => {
  try {
    const { title, description, points, link } = req.body;
    const { slug } = req.params;
    const { file } = req;
    const task = await Task.findOne({ slug });
    if (!task) {
      return res.status(404).json({ message: "Task not found", status: false });
    }
    const public_id = task.icon?.public_id;
    if (public_id && file) {
      const { result } = await cloudinary.uploader.destroy(public_id);
      if (result !== "ok")
        return res.status(404).json({ error: "Could not remove icon !" });
    }

    if (file) {
      const { secure_url: url, public_id } = await cloudinary.uploader.upload(
        file.path
      );
      task.icon = { url, public_id };
    }

    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (points !== undefined) task.points = points;
    if (link !== undefined) task.link = link;

    const updated = await task.save();
    res.status(200).json({
      task: {
        id: updated._id,
        title: updated.title,
        slug: updated.slug,
        description: updated.description,
        points: updated.points,
        link: updated.link,
        icon: updated.icon?.url,
      },
      status: true,
      message: "Task updated successfully",
    });
  } catch (error) {
    res.status(500).json({ error: error, status: false });
  }
};

export const completeTask = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { username } = req.body;
    console.log(username);
    const task = await Task.findOne({ slug });
    if (!task) {
      return res.status(404).json({ message: "Task not found", status: false });
    }
    const user = await User.findOne({ username: username });
    if (!user) {
      return res.status(404).json({ message: "User not found", status: false });
    }
    user.tasksCompleted.push(task._id);
    await user.save();
    res
      .status(200)
      .json({ message: "Task completed successfully", status: true });
  } catch (error) {
    res.status(500).json({ error: error, status: false });
  }
};
