import { Request, Response } from "express";
import Project from "../model/project.model";
import Task from "../model/task.model";
import User from "../model/user.model";
import TaskSubmission from "../model/taskSubmission.model";
import cloudinary from "../cloud";
import mongoose from "mongoose";

export const createProject = async (req: Request, res: Response) => {
  try {
    const { file } = req;
    
    // Enhanced logging for debugging
    console.log("=== CREATE PROJECT REQUEST ===");
    console.log("Request Body:", JSON.stringify(req.body, null, 2));
    console.log("Request Body Keys:", Object.keys(req.body));
    console.log("File:", file ? { 
      fieldname: file.fieldname, 
      originalname: file.originalname, 
      mimetype: file.mimetype,
      size: file.size 
    } : "No file");
    console.log("Content-Type:", req.headers["content-type"]);
    console.log("================================");
    
    const { name, description, socials, numberOfParticipants } = req.body;

    if (!name || !description || numberOfParticipants === undefined || numberOfParticipants === null) {
      console.log("Validation failed - missing required fields");
      console.log("Name:", name);
      console.log("Description:", description);
      console.log("numberOfParticipants:", numberOfParticipants);
      return res.status(400).json({
        message: "Name, description, and numberOfParticipants are required",
      });
    }

    const participantsNum = typeof numberOfParticipants === "string" 
      ? parseInt(numberOfParticipants, 10) 
      : Number(numberOfParticipants);

    console.log("Parsed numberOfParticipants:", participantsNum, "Type:", typeof participantsNum);

    if (isNaN(participantsNum) || participantsNum < 1) {
      console.log("Invalid numberOfParticipants value:", numberOfParticipants);
      return res.status(400).json({
        message: "numberOfParticipants must be a number greater than 0",
      });
    }

    const slug = name.toLowerCase().split(" ").join("-");
    console.log("Generated slug:", slug);

    const projectExists = await Project.findOne({ slug });
    if (projectExists) {
      return res.status(400).json({
        message: "Project already exists",
      });
    }

    const project = new Project({ 
      name, 
      slug, 
      description, 
      numberOfParticipants: participantsNum,
      status: "in-progress",
      joinedUsers: [],
    });

    // Handle logo upload
    if (file) {
      const { secure_url: url, public_id } = await cloudinary.uploader.upload(
        file.path,
        {
          folder: "matara-projects",
        }
      );
      project.logo = { url, public_id };
    }

    // Handle socials (expecting JSON array with platform, url, and optional icon URL)
    if (socials) {
      try {
        const parsedSocials = typeof socials === "string" ? JSON.parse(socials) : socials;
        if (Array.isArray(parsedSocials)) {
          project.socials = parsedSocials.map((social: any) => {
            const socialObj: any = {
              platform: social.platform,
              url: social.url,
            };
            if (social.icon) {
              socialObj.icon = { url: social.icon };
            }
            return socialObj;
          }) as any;
        }
      } catch (error) {
        console.error("Error parsing socials:", error);
        return res.status(400).json({
          message: "Invalid socials format. Expected JSON array.",
        });
      }
    }

    await project.save();
    res.status(201).json({
      message: "Project created successfully",
      data: project,
    });
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getProjects = async (req: Request, res: Response) => {
  try {
    const projects = await Project.find().lean().sort({ createdAt: -1 });
    
    // Convert all ObjectIds to strings for consistent comparison
    const serializedProjects = projects.map((project: any) => ({
      ...project,
      _id: project._id.toString(),
      // joinedUsers now contains usernames (strings), no conversion needed
      joinedUsers: project.joinedUsers,
    }));
    
    res.status(200).json({
      data: serializedProjects,
      message: "Projects fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getProject = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { username } = req.query;
    const project = await Project.findOne({ slug });
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Fetch all tasks under this project
    const tasks = await Task.find({ projectId: project._id }).lean();

    // Populate user details for joinedUsers if needed
    let joinedUsersDetails: any[] = [];
    if (project.joinedUsers.length > 0) {
      const users = await User.find({ username: { $in: project.joinedUsers } }).select("username profilePicture").lean();
      joinedUsersDetails = users;
    }

    // If username is provided, fetch user's submission status for each task
    let serializedTasks = tasks;
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
        serializedTasks = tasks.map((task: any) => {
          const submission = submissionMap.get(task._id.toString());
          return {
            ...task,
            _id: task._id.toString(),
            projectId: task.projectId.toString(),
            completed: completedTaskIds.has(task._id.toString()),
            submissionStatus: submission?.status || "non-started",
            proofUrl: submission?.proofUrl || null,
            reviewedBy: submission?.reviewedBy || null,
            reviewedAt: submission?.reviewedAt || null,
            rejectionReason: submission?.rejectionReason || null,
          };
        });
      } else {
        // User not found, just serialize tasks without submission status
        serializedTasks = tasks.map((task: any) => ({
          ...task,
          _id: task._id.toString(),
          projectId: task.projectId.toString(),
        }));
      }
    } else {
      // If no username, just serialize the task IDs
      serializedTasks = tasks.map((task: any) => ({
        ...task,
        _id: task._id.toString(),
        projectId: task.projectId.toString(),
      }));
    }

    // Convert project to plain object and ensure all IDs are strings
    const projectObj = project.toObject();
    const serializedProject = {
      ...projectObj,
      _id: projectObj._id.toString(),
      joinedUsers: project.joinedUsers, // Now contains usernames (strings)
      joinedUsersDetails, // Populated user details
    };

    res.status(200).json({ 
      data: {
        ...serializedProject,
        tasks: serializedTasks,
        currentParticipants: project.joinedUsers.length,
      }, 
      message: "Project fetched successfully" 
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateProject = async (req: Request, res: Response) => {
  try {
    const { name, description, socials, numberOfParticipants } = req.body;
    const { slug } = req.params;
    const { file } = req;

    const project = await Project.findOne({ slug });
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Handle logo upload
    if (file) {
      if (project.logo?.public_id) {
        await cloudinary.uploader.destroy(project.logo.public_id);
      }
      const { secure_url: url, public_id } = await cloudinary.uploader.upload(
        file.path,
        {
          folder: "matara-projects",
        }
      );
      project.logo = { url, public_id };
    }

    if (name) {
      const newSlug = name.toLowerCase().split(" ").join("-");
      // Check if new slug conflicts with another project
      if (newSlug !== slug) {
        const slugExists = await Project.findOne({ slug: newSlug });
        if (slugExists) {
          return res.status(400).json({
            message: "A project with this name already exists",
          });
        }
      }
      project.name = name;
      project.slug = newSlug;
      project.numberOfParticipants = numberOfParticipants;
    }

    if (description) {
      project.description = description;
    }

    // Handle socials update
    if (socials !== undefined) {
      try {
        const parsedSocials = typeof socials === "string" ? JSON.parse(socials) : socials;
        if (Array.isArray(parsedSocials)) {
          // Delete old social icons from cloudinary before replacing
          for (const oldSocial of project.socials) {
            if (oldSocial.icon?.public_id) {
              await cloudinary.uploader.destroy(oldSocial.icon.public_id);
            }
          }
          
          project.socials = parsedSocials.map((social: any) => {
            const socialObj: any = {
              platform: social.platform,
              url: social.url,
            };
            if (social.icon) {
              socialObj.icon = { url: social.icon };
            }
            return socialObj;
          }) as any;
        }
      } catch (error) {
        console.error("Error parsing socials:", error);
        return res.status(400).json({
          message: "Invalid socials format. Expected JSON array.",
        });
      }
    }

    const updated = await project.save();
    res.status(200).json({
      data: updated,
      message: "Project updated successfully",
    });
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteProject = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const project = await Project.findOneAndDelete({ slug });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Delete logo from cloudinary
    if (project.logo?.public_id) {
      await cloudinary.uploader.destroy(project.logo.public_id);
    }

    // Delete all social icons from cloudinary
    if (project.socials && project.socials.length > 0) {
      for (const social of project.socials) {
        if (social.icon?.public_id) {
          await cloudinary.uploader.destroy(social.icon.public_id);
        }
      }
    }

    res.status(200).json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const joinProject = async (req: Request, res: Response) => {
  const { slug } = req.params;
  const { username } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("=== JOIN PROJECT REQUEST ===");
    console.log("Username:", username);
    console.log("Project Slug:", slug);
    
    if (!username) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Username is required" });
    }

    const project = await Project.findOne({ slug }).session(session);
    if (!project) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Project not found" });
    }

    // Check if project is completed
    if (project.status === "completed") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: "Project is closed. Cannot join completed projects." 
      });
    }

    // Check if project is full
    if (project.joinedUsers.length >= project.numberOfParticipants) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: "Project is full. Maximum participants reached." 
      });
    }

    const user = await User.findOne({ username }).session(session);
    console.log("User found:", user ? {
      username: user.username,
      _id: user._id.toString()
    } : "NOT FOUND");
    
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user has already joined (now checking by username)
    const alreadyJoined = project.joinedUsers.includes(username);
    if (alreadyJoined) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: "User has already joined this project" 
      });
    }

    // Add username to joinedUsers array
    project.joinedUsers.push(username);
    console.log("After adding user, joinedUsers count:", project.joinedUsers.length);
    console.log("New joinedUsers:", project.joinedUsers);

    // Check if we've reached the participant limit
    if (project.joinedUsers.length >= project.numberOfParticipants) {
      project.status = "completed";
      console.log("Project limit reached, setting status to completed");
    }

    await project.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Verify the user was actually added - re-fetch to see what was actually saved
    const savedProject = await Project.findById(project._id);
    console.log("Saved project joinedUsers:", savedProject?.joinedUsers);
    console.log("Expected username:", username);
    console.log("Actual saved usernames:", savedProject?.joinedUsers);
    console.log("================================");

    // Ensure the response includes the correct username
    const responseData = {
      project: {
        ...project.toObject(),
        _id: project._id.toString(),
        joinedUsers: project.joinedUsers, // Now contains usernames
      },
      joinedCount: project.joinedUsers.length,
      maxParticipants: project.numberOfParticipants,
      status: project.status,
      username: username,
    };

    res.status(200).json({ 
      message: "Successfully joined project",
      data: responseData,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error joining project:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

