import multer, { StorageEngine, FileFilterCallback } from 'multer';
import { Request } from 'express';

// Define the storage engine
const storage: StorageEngine = multer.diskStorage({});

// Define the file filter
const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (!file.mimetype.includes('image')) {
        return cb(new Error("Invalid image format!")  as unknown as null, false);
    }
    cb(null, true);
};

// Export the multer setup
const upload = multer({ storage, fileFilter });

export default upload;
