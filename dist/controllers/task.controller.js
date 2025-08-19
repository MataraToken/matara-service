"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeTask = exports.updateTask = exports.getTask = exports.getUserTasks = exports.createTask = void 0;
const task_model_1 = __importDefault(require("../model/task.model"));
const user_model_1 = __importDefault(require("../model/user.model"));
const cloud_1 = __importDefault(require("../cloud"));
const mongoose_1 = __importDefault(require("mongoose"));
const points_model_1 = __importDefault(require("../model/points.model"));
const createTask = async (req, res) => {
    try {
        const { file } = req;
        const { title, description, points, link } = req.body;
        const slug = title.toLowerCase().split(" ").join("-");
        const taskExists = await task_model_1.default.findOne({ slug });
        if (taskExists) {
            return res.status(400).json({
                message: "Task already exists",
            });
        }
        const task = new task_model_1.default({ title, slug, description, points, link });
        if (file) {
            const { secure_url: url, public_id } = await cloud_1.default.uploader.upload(file.path);
            task.icon = { url, public_id };
        }
        await task.save();
        res.status(201).json({
            message: "Task created successfully",
        });
    }
    catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.createTask = createTask;
const getUserTasks = async (req, res) => {
    const { username } = req.params;
    try {
        const user = await user_model_1.default.findOne({ username }).select("tasksCompleted").lean();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const completedTaskIds = new Set(user.tasksCompleted.map(id => id.toString()));
        const allTasks = await task_model_1.default.find().lean();
        const tasksWithCompletionStatus = allTasks.map((task) => ({
            ...task,
            completed: completedTaskIds.has(task._id.toString()),
        }));
        res.status(200).json({
            data: tasksWithCompletionStatus,
            message: "Tasks fetched successfully",
        });
    }
    catch (error) {
        console.error("Error fetching user tasks:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getUserTasks = getUserTasks;
const getTask = async (req, res) => {
    try {
        const { slug } = req.params;
        const task = await task_model_1.default.findOne({ slug });
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }
        res.status(200).json({ task, message: "Task fetched successfully" });
    }
    catch (error) {
        console.error("Error fetching task:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getTask = getTask;
const updateTask = async (req, res) => {
    try {
        const { title, description, points, link } = req.body;
        const { slug } = req.params;
        const { file } = req;
        const task = await task_model_1.default.findOne({ slug });
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }
        if (file) {
            if (task.icon?.public_id) {
                await cloud_1.default.uploader.destroy(task.icon.public_id);
            }
            const { secure_url: url, public_id } = await cloud_1.default.uploader.upload(file.path);
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
    }
    catch (error) {
        console.error("Error updating task:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.updateTask = updateTask;
const completeTask = async (req, res) => {
    const { slug } = req.params;
    const { username } = req.body;
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const task = await task_model_1.default.findOne({ slug }).session(session);
        if (!task) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Task not found" });
        }
        const user = await user_model_1.default.findOne({ username }).session(session);
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
        const points = await points_model_1.default.findOne({ userId: user._id }).session(session);
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
    }
    catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error completing task:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.completeTask = completeTask;
//# sourceMappingURL=task.controller.js.map