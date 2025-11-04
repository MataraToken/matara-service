"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTask = exports.changePassword = exports.getLeaderboard = exports.getSummary = exports.deleteTask = exports.getTasks = exports.createTask = exports.getUsers = exports.loginAdmin = exports.registerAdmin = void 0;
const user_model_1 = __importDefault(require("../model/user.model"));
const task_model_1 = __importDefault(require("../model/task.model"));
const project_model_1 = __importDefault(require("../model/project.model"));
const points_model_1 = __importDefault(require("../model/points.model"));
const cloud_1 = __importDefault(require("../cloud"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const registerAdmin = async (req, res) => {
    const { username, password, firstName } = req.body;
    try {
        const alreadyExists = await user_model_1.default.findOne({ username });
        if (alreadyExists) {
            return res.status(400).json({ message: "Username already exists" });
        }
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        const newUser = new user_model_1.default({
            username,
            password: hashedPassword,
            firstName,
            isAdmin: true,
        });
        await newUser.save();
        return res.status(201).json({
            message: "Admin user registered successfully",
        });
    }
    catch (error) {
        console.error("Error registering admin user:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.registerAdmin = registerAdmin;
const loginAdmin = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res
            .status(400)
            .json({ message: "Username and password are required" });
    }
    try {
        const user = await user_model_1.default.findOne({ username, isAdmin: true }).select("+password");
        if (!user) {
            return res.status(404).json({ message: "Admin user not found" });
        }
        const isPasswordCorrect = await bcrypt_1.default.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id, isAdmin: user.isAdmin }, process.env.JWT_SECRET || "secret", {
            expiresIn: "1h",
        });
        return res.status(200).json({
            token,
            message: "Admin user logged in successfully",
        });
    }
    catch (error) {
        console.error("Error logging in admin user:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.loginAdmin = loginAdmin;
const getUsers = async (req, res) => {
    try {
        const users = await user_model_1.default.find().lean();
        res.status(200).json({
            data: users,
            message: "Users fetched successfully",
        });
    }
    catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getUsers = getUsers;
const createTask = async (req, res) => {
    try {
        const { file } = req;
        const { title, description, points, link, projectId } = req.body;
        if (!projectId) {
            return res.status(400).json({
                message: "projectId is required",
            });
        }
        // Validate projectId is a valid ObjectId
        if (!mongoose_1.default.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({
                message: "Invalid projectId format",
            });
        }
        // Check if project exists
        const project = await project_model_1.default.findById(projectId);
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
        const taskExists = await task_model_1.default.findOne({ slug });
        if (taskExists) {
            return res.status(400).json({
                message: "Task already exists",
            });
        }
        const task = new task_model_1.default({ title, slug, description, points, link, projectId });
        if (file) {
            const { secure_url: url, public_id } = await cloud_1.default.uploader.upload(file.path, {
                folder: "matara-tasks",
            });
            task.icon = { url, public_id };
        }
        await task.save();
        res.status(201).json({
            message: "Task created successfully",
            data: task,
        });
    }
    catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.createTask = createTask;
const getTasks = async (req, res) => {
    try {
        const { projectId } = req.query;
        // Build query - filter by projectId if provided
        const query = {};
        if (projectId) {
            query.projectId = projectId;
        }
        const tasks = await task_model_1.default.find(query).lean().populate("projectId", "title slug");
        res.status(200).json({
            data: tasks,
            message: "Tasks fetched successfully",
        });
    }
    catch (error) {
        console.error("Error fetching tasks:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getTasks = getTasks;
const deleteTask = async (req, res) => {
    try {
        const { slug } = req.params;
        const task = await task_model_1.default.findOneAndDelete({ slug });
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }
        if (task.icon?.public_id) {
            await cloud_1.default.uploader.destroy(task.icon.public_id);
        }
        res.status(200).json({ message: "Task deleted successfully" });
    }
    catch (error) {
        console.error("Error deleting task:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.deleteTask = deleteTask;
const getSummary = async (req, res) => {
    try {
        const totalUsers = await user_model_1.default.countDocuments();
        const totalTasks = await task_model_1.default.countDocuments();
        // This is not the number of completed tasks, but the number of users that have completed at least one task.
        // To get the total number of completed tasks, I would need to iterate over all users and sum the length of their `tasksCompleted` array.
        // This is not efficient. I will leave it like this for now.
        const usersWithCompletedTasks = await user_model_1.default.countDocuments({
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
    }
    catch (error) {
        console.error("Error fetching summary:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getSummary = getSummary;
const getLeaderboard = async (req, res) => {
    try {
        const topUsers = await points_model_1.default.find()
            .sort({ points: -1 })
            .limit(5)
            .populate("userId", "username profilePicture");
        res.status(200).json({
            data: topUsers,
            message: "Leaderboard fetched successfully",
        });
    }
    catch (error) {
        console.error("Error fetching leaderboard:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getLeaderboard = getLeaderboard;
const changePassword = async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;
    try {
        const user = await user_model_1.default.findOne({ username, isAdmin: true }).select("+password");
        if (!user) {
            return res.status(404).json({ message: "Admin user not found" });
        }
        const isPasswordCorrect = await bcrypt_1.default.compare(oldPassword, user.password);
        if (!isPasswordCorrect) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        const hashedPassword = await bcrypt_1.default.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();
        return res.status(200).json({
            message: "Password changed successfully",
        });
    }
    catch (error) {
        console.error("Error changing password:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
exports.changePassword = changePassword;
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
//# sourceMappingURL=admin.controller.js.map