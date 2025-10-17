import { Request, Response } from "express";

const router = require("express").Router();


router.get("/", (req : Request, res : Response) => res.status(200).send("pong"));


export default router;
