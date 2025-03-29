"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const multer_1 = __importDefault(require("multer"));
// Define the storage engine
const storage = multer_1.default.diskStorage({});
// Define the file filter
const fileFilter = (req, file, cb) => {
    if (!file.mimetype.includes('image')) {
        return cb(new Error("Invalid image format!"), false);
    }
    cb(null, true);
};
// Export the multer setup
const upload = (0, multer_1.default)({ storage, fileFilter });
exports.default = upload;
//# sourceMappingURL=upload.js.map