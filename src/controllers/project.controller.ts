import { Request, Response } from "express";
import Project from "../model/project.model";
import Task from "../model/task.model";
import User from "../model/user.model";
import cloudinary from "../cloud";
import mongoose from "mongoose";

export const createProject = async (req: Request, res: Response) => {
  try {
    const { file } = req;
    const { name, description, socials, numberOfParticipants } = req.body;

    if (!name || !description || numberOfParticipants === undefined || numberOfParticipants === null) {
      return res.status(400).json({
        message: "Name, description, and numberOfParticipants are required",
      });
    }

    const participantsNum = typeof numberOfParticipants === "string" 
      ? parseInt(numberOfParticipants, 10) 
      : Number(numberOfParticipants);

    if (isNaN(participantsNum) || participantsNum < 1) {
      return res.status(400).json({
        message: "numberOfParticipants must be a number greater than 0",
      });
    }

    const slug = name.toLowerCase().split(" ").join("-");

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
    res.status(200).json({
      data: projects,
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
    const project = await Project.findOne({ slug }).populate("joinedUsers", "username profilePicture");
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Fetch all tasks under this project
    const tasks = await Task.find({ projectId: project._id }).lean();

    res.status(200).json({ 
      data: {
        ...project.toObject(),
        tasks,
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
    const { name, description, socials } = req.body;
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
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user has already joined
    if (project.joinedUsers.some((id) => id.toString() === user._id.toString())) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        message: "User has already joined this project" 
      });
    }

    // Add user to joinedUsers
    project.joinedUsers.push(user._id);

    // Check if we've reached the participant limit
    if (project.joinedUsers.length >= project.numberOfParticipants) {
      project.status = "completed";
    }

    await project.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ 
      message: "Successfully joined project",
      data: {
        project: project.toObject(),
        joinedCount: project.joinedUsers.length,
        maxParticipants: project.numberOfParticipants,
        status: project.status,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error joining project:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

