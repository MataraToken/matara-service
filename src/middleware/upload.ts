import multer, { StorageEngine, FileFilterCallback } from 'multer';
import { Request } from 'express';

// Minimal type for multer file in fileFilter (avoids Express.Multer namespace issues)
interface MulterFile {
  mimetype: string;
}

// Define the storage engine
const storage: StorageEngine = multer.diskStorage({});

// Define the file filter
const fileFilter = (req: Request, file: MulterFile, cb: FileFilterCallback) => {
    if (!file.mimetype.includes('image')) {
        return cb(new Error("Invalid image format!")  as unknown as null, false);
    }
    cb(null, true);
};

// Export the multer setup with file size limits
// 10MB limit per file (Cloudinary free tier limit is 10MB, paid is 20MB)
const upload = multer({ 
  storage, 
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB in bytes
    fieldSize: 10 * 1024 * 1024, // 10MB for form fields
  }
});

export default upload;
