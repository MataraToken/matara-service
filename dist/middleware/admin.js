"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const isAdmin = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || "secret");
        if (!decoded.isAdmin) {
            return res.status(403).json({ message: "Forbidden: User is not an admin" });
        }
        next();
    }
    catch (error) {
        console.error("Error in isAdmin middleware:", error);
        return res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
};
exports.isAdmin = isAdmin;
//# sourceMappingURL=admin.js.map