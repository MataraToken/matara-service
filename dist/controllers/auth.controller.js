"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.loginUser = exports.createPassword = exports.checkPasswordStatus = void 0;
const user_model_1 = __importDefault(require("../model/user.model"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const checkPasswordStatus = async (req, res) => {
    const { username } = req.query;
    if (!username) {
        return res.status(400).json({ hasPassword: false, message: "Username is required" });
    }
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            return res.status(404).json({ hasPassword: false, message: "User not found" });
        }
        return res.status(200).json({
            hasPassword: user.hasPassword,
            message: user.hasPassword ? "User has password set" : "User needs to create password"
        });
    }
    catch (error) {
        console.error("Error checking password status:", error);
        return res.status(500).json({ hasPassword: false, message: "Internal server error" });
    }
};
exports.checkPasswordStatus = checkPasswordStatus;
const createPassword = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({
            message: "Username and password are required"
        });
    }
    try {
        const user = await user_model_1.default.findOne({ username });
        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }
        if (user.hasPassword) {
            return res.status(400).json({
                message: "User already has a password set"
            });
        }
        // Hash the password
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        // Update user with password and hasPassword flag
        await user_model_1.default.updateOne({ username }, {
            password: hashedPassword,
            hasPassword: true
        });
        // Generate JWT token after password creation
        const token = jsonwebtoken_1.default.sign({
            id: user._id,
            username: user.username,
            isAdmin: user.isAdmin
        }, process.env.JWT_SECRET || "secret", {
            expiresIn: "24h",
        });
        return res.status(200).json({
            token,
            message: "Password created successfully"
        });
    }
    catch (error) {
        console.error("Error creating password:", error);
        return res.status(500).json({
            message: "Internal server error"
        });
    }
};
exports.createPassword = createPassword;
const loginUser = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({
            message: "Username and password are required"
        });
    }
    try {
        const user = await user_model_1.default.findOne({ username }).select("+password");
        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }
        if (!user.hasPassword) {
            return res.status(400).json({
                message: "User has not set a password yet"
            });
        }
        // Compare password
        const isPasswordCorrect = await bcrypt_1.default.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(401).json({
                message: "Invalid credentials"
            });
        }
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({
            id: user._id,
            username: user.username,
            isAdmin: user.isAdmin
        }, process.env.JWT_SECRET || "secret", {
            expiresIn: "24h",
        });
        return res.status(200).json({
            token,
            message: "Login successful"
        });
    }
    catch (error) {
        console.error("Error logging in user:", error);
        return res.status(500).json({
            message: "Internal server error"
        });
    }
};
exports.loginUser = loginUser;
const verifyToken = async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "No token provided"
        });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || "secret");
        // Optionally verify user still exists
        const user = await user_model_1.default.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                message: "User not found"
            });
        }
        return res.status(200).json({
            message: "Token is valid",
            user: {
                id: user._id,
                username: user.username,
                firstName: user.firstName,
                walletAddress: user.walletAddress,
                isAdmin: user.isAdmin
            }
        });
    }
    catch (error) {
        console.error("Error verifying token:", error);
        return res.status(401).json({
            message: "Invalid token"
        });
    }
};
exports.verifyToken = verifyToken;
//# sourceMappingURL=auth.controller.js.map