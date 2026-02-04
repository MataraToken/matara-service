import { Request, Response } from "express";
import Task from "../model/task.model";
import User from "../model/user.model";
import Project from "../model/project.model";
import TaskSubmission from "../model/taskSubmission.model";
import cloudinary from "../cloud";
import mongoose from "mongoose";
import Point from "../model/points.model";
import { compressLogo } from "../utils/imageCompression";
import fs from "fs/promises";


export const getUserTasks = async (req: Request, res: Response) => {
  const { username } = req.params;
  const { projectId } = req.query;
  try {
    const user = await User.findOne({ username }).select("tasksCompleted").lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const completedTaskIds = new Set(user.tasksCompleted.map(id => id.toString()));

    // Build query - filter by projectId if provided
    const query: any = {};
    if (projectId) {
      query.projectId = projectId;
    }

    const allTasks = await Task.find(query).lean();

    // Get all task submissions for this user
    const submissions = await TaskSubmission.find({ userId: user._id }).lean();
    const submissionMap = new Map();
    submissions.forEach((sub: any) => {
      submissionMap.set(sub.taskId.toString(), {
        status: sub.status,
        proofUrl: sub.proofUrl,
        reviewedBy: sub.reviewedBy,
        reviewedAt: sub.reviewedAt,
        rejectionReason: sub.rejectionReason,
      });
    });

    const tasksWithCompletionStatus = allTasks.map((task) => {
      const submission = submissionMap.get(task._id.toString());
      return {
        ...task,
        _id: task._id.toString(),
        completed: completedTaskIds.has(task._id.toString()),
        submissionStatus: submission?.status || "non-started",
        proofUrl: submission?.proofUrl,
        reviewedBy: submission?.reviewedBy,
        reviewedAt: submission?.reviewedAt,
        rejectionReason: submission?.rejectionReason,
      };
    });

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
    const task = await Task.findOne({ slug }).populate("projectId", "name slug description logo socials");
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    res.status(200).json({ task, message: "Task fetched successfully" });
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getTasksByProjectId = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { username } = req.query;

    // Validate projectId format
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: "Invalid projectId format" });
    }

    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Fetch all tasks under this project
    const tasks = await Task.find({ projectId }).populate("projectId", "name slug description logo socials status numberOfParticipants joinedUsers").lean();

    // If username is provided, fetch user's submission status for each task
    let tasksWithSubmissionStatus = tasks;
    if (username) {
      const user = await User.findOne({ username }).select("_id tasksCompleted").lean();
      if (user) {
        const completedTaskIds = new Set(user.tasksCompleted.map((id: any) => id.toString()));

        // Get all task submissions for this user
        const submissions = await TaskSubmission.find({ userId: user._id }).lean();
        const submissionMap = new Map();
        submissions.forEach((sub: any) => {
          submissionMap.set(sub.taskId.toString(), {
            status: sub.status,
            proofUrl: sub.proofUrl,
            reviewedBy: sub.reviewedBy,
            reviewedAt: sub.reviewedAt,
            rejectionReason: sub.rejectionReason,
          });
        });

        // Add submission status to each task
        tasksWithSubmissionStatus = tasks.map((task: any) => {
          const submission = submissionMap.get(task._id.toString());
          return {
            ...task,
            _id: task._id.toString(),
            completed: completedTaskIds.has(task._id.toString()),
            submissionStatus: submission?.status || "non-started",
            proofUrl: submission?.proofUrl,
            reviewedBy: submission?.reviewedBy,
            reviewedAt: submission?.reviewedAt,
            rejectionReason: submission?.rejectionReason,
          };
        });
      }
    } else {
      // If no username, just serialize the task IDs
      tasksWithSubmissionStatus = tasks.map((task: any) => ({
        ...task,
        _id: task._id.toString(),
      }));
    }

    res.status(200).json({
      data: tasksWithSubmissionStatus,
      project: {
        _id: project._id,
        name: project.name,
        slug: project.slug,
        status: project.status,
        currentParticipants: project.joinedUsers.length,
        maxUsers: project.numberOfParticipants,
      },
      message: "Tasks fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching tasks by project ID:", error);
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
      
      let compressedPath = file.path;
      try {
        // Compress image before upload
        compressedPath = await compressLogo(file.path);
      } catch (error) {
        console.error("Error compressing task icon:", error);
        // Continue with original file if compression fails
      }

      try {
        const { secure_url: url, public_id } = await cloudinary.uploader.upload(
          compressedPath
        );
        task.icon = { url, public_id };
      } finally {
        // Clean up compressed file if it's different from original
        if (compressedPath !== file.path) {
          try {
            await fs.unlink(compressedPath);
          } catch (error) {
            console.error("Error deleting compressed file:", error);
          }
        }
      }
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
  // Get authenticated user from JWT token
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized: User not authenticated" });
  }

  const { slug } = req.params;
  const { proofUrl } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!proofUrl) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Proof URL is required" });
    }

    const task = await Task.findOne({ slug }).session(session);
    if (!task) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Task not found" });
    }

    // Get user from JWT token
    const user = await User.findById(req.user.id).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user already has a completed submission
    const existingSubmission = await TaskSubmission.findOne({
      userId: user._id,
      taskId: task._id,
      status: "complete",
    }).session(session);

    if (existingSubmission) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Task already completed" });
    }

    // Check if there's already a submission in review
    const reviewingSubmission = await TaskSubmission.findOne({
      userId: user._id,
      taskId: task._id,
      status: "reviewing",
    }).session(session);

    if (reviewingSubmission) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: "Task submission is already under review" 
      });
    }

    // Check if task belongs to a project and if user has joined that project
    if (task.projectId) {
      const project = await Project.findById(task.projectId).session(session);
      if (!project) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Project not found for this task" });
      }

      // Check if user has joined the project (now checking by username)
      const hasJoined = project.joinedUsers.includes(user.username);
      
      // Check if project is completed (closed)
      if (project.status === "completed") {
        // Only allow users who have joined to complete tasks
        if (!hasJoined) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({ 
            message: "Project is closed. Only users who joined the project can complete tasks." 
          });
        }
      } else {
        // For in-progress projects, check if user has joined
        if (!hasJoined) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({ 
            message: "You must join the project before completing tasks." 
          });
        }
      }
    }

    // Create or update task submission with reviewing status
    const submission = await TaskSubmission.findOneAndUpdate(
      { userId: user._id, taskId: task._id },
      {
        userId: user._id,
        taskId: task._id,
        username: user.username,
        proofUrl,
        status: "reviewing",
      },
      { upsert: true, new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ 
      message: "Task submission submitted for review",
      data: {
        submissionId: submission._id.toString(),
        status: submission.status,
        taskSlug: task.slug,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error submitting task:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

