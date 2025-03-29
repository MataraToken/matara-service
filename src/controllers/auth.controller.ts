import { Request, Response } from "express";
import User from "../model/user.model";


export const authenticateUser = async (req: Request, res: Response) => {
    const {username} = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }else{
            
        }
    } catch (error) {
        
    }
}