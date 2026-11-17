import express from "express";
import { createPost } from "../controllers/posts.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/", authenticate, createPost);

export default router;
