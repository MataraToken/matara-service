import { Request, Response } from "express";
import User from "../model/user.model";
import Task from "../model/task.model";
import Project from "../model/project.model";
import TaskSubmission from "../model/taskSubmission.model";
import Point from "../model/points.model";
import cloudinary from "../cloud";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

export const registerAdmin = async (req: Request, res: Response) => {
  const { username, password, firstName } = req.body;

  try {
    const alreadyExists = await User.findOne({ username });
    if (alreadyExists) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      password: hashedPassword,
      firstName,
      isAdmin: true,
    });

    await newUser.save();

    return res.status(201).json({
      message: "Admin user registered successfully",
    });
  } catch (error) {
    console.error("Error registering admin user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const loginAdmin = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required" });
  }

  try {
    const user = await User.findOne({ username, isAdmin: true }).select(
      "+password"
    );
    if (!user) {
      return res.status(404).json({ message: "Admin user not found" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password!);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, isAdmin: user.isAdmin },
      process.env.JWT_SECRET || "secret",
      {
        expiresIn: "1h",
      }
    );

    return res.status(200).json({
      token,
      message: "Admin user logged in successfully",
    });
  } catch (error) {
    console.error("Error logging in admin user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

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
    const { title, description, points, link, projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({
        message: "projectId is required",
      });
    }

    // Validate projectId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        message: "Invalid projectId format",
      });
    }

    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    if (!title || !description || !points || !link) {
      return res.status(400).json({
        message: "Title, description, points, and link are required",
      });
    }

    const slug = title.toLowerCase().split(" ").join("-");

    const taskExists = await Task.findOne({ slug });
    if (taskExists) {
      return res.status(400).json({
        message: "Task already exists",
      });
    }
    
    const task = new Task({ title, slug, description, points, link, projectId });

    if (file) {
      const { secure_url: url, public_id } = await cloudinary.uploader.upload(
        file.path,
        {
          folder: "matara-tasks",
        }
      );
      task.icon = { url, public_id };
    }

    await task.save();
    res.status(201).json({
      message: "Task created successfully",
      data: task,
    });
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


export const getTasks = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    
    // Build query - filter by projectId if provided
    const query: any = {};
    if (projectId) {
      query.projectId = projectId;
    }

    const tasks = await Task.find(query).lean().populate("projectId", "title slug");
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
    const usersWithCompletedTasks = await User.countDocuments({
      tasksCompleted: { $exists: true, $ne: [] },
    });

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

export const changePassword = async (req: Request, res: Response) => {
  const { username, oldPassword, newPassword } = req.body;

  try {
    const user = await User.findOne({ username, isAdmin: true }).select(
      "+password"
    );
    if (!user) {
      return res.status(404).json({ message: "Admin user not found" });
    }

    const isPasswordCorrect = await bcrypt.compare(oldPassword, user.password!);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Error changing password:", error);
    return res.status(500).json({ message: "Internal server error" });
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

export const getTaskSubmissionsForReview = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    
    // Default to "reviewing" if no status provided
    const queryStatus = status || "reviewing";
    
    const query: any = { status: queryStatus };
    
    const submissions = await TaskSubmission.find(query)
      .populate("userId", "username profilePicture")
      .populate("taskId", "title slug description points link icon")
      .sort({ createdAt: -1 })
      .lean();

    const serializedSubmissions = submissions.map((submission: any) => ({
      ...submission,
      _id: submission._id.toString(),
      userId: submission.userId._id.toString(),
      taskId: submission.taskId._id.toString(),
      user: {
        _id: submission.userId._id.toString(),
        username: submission.userId.username,
        profilePicture: submission.userId.profilePicture,
      },
      task: {
        _id: submission.taskId._id.toString(),
        title: submission.taskId.title,
        slug: submission.taskId.slug,
        description: submission.taskId.description,
        points: submission.taskId.points,
        link: submission.taskId.link,
        icon: submission.taskId.icon,
      },
    }));

    res.status(200).json({
      data: serializedSubmissions,
      message: "Task submissions fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching task submissions:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const reviewTaskSubmission = async (req: Request, res: Response) => {
  const { submissionId } = req.params;
  const { action, rejectionReason } = req.body; // action: "approve" or "reject"
  const adminUser = req.user; // From auth middleware

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!action || !["approve", "reject"].includes(action)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: "Action is required and must be 'approve' or 'reject'" 
      });
    }

    const submission = await TaskSubmission.findById(submissionId).session(session);
    if (!submission) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Task submission not found" });
    }

    if (submission.status !== "reviewing") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: `Task submission is already ${submission.status}` 
      });
    }

    const user = await User.findById(submission.userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    const task = await Task.findById(submission.taskId).session(session);
    if (!task) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Task not found" });
    }

    if (action === "approve") {
      // Update submission status to complete
      submission.status = "complete";
      submission.reviewedBy = adminUser?.username || "admin";
      submission.reviewedAt = new Date();

      // Award points and mark task as completed
      const points = await Point.findOne({ userId: user._id }).session(session);
      if (!points) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Points not found" });
      }

      // Only add to tasksCompleted if not already there
      if (!user.tasksCompleted.includes(task._id)) {
        user.tasksCompleted.push(task._id);
        points.points += task.points;
      }

      await user.save({ session });
      await points.save({ session });
    } else if (action === "reject") {
      // Update submission status to rejected
      submission.status = "rejected";
      submission.reviewedBy = adminUser?.username || "admin";
      submission.reviewedAt = new Date();
      if (rejectionReason) {
        submission.rejectionReason = rejectionReason;
      }
    }

    await submission.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: `Task submission ${action === "approve" ? "approved" : "rejected"} successfully`,
      data: {
        submissionId: submission._id.toString(),
        status: submission.status,
        reviewedBy: submission.reviewedBy,
        reviewedAt: submission.reviewedAt,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error reviewing task submission:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
