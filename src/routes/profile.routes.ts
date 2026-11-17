import express from "express";
import {
  getUserPosts,
  getAllUsers,
  getCurrentUser,
  groupUsersByInterest,
} from "../controllers/user.controller.js";
import { authorizeAdmin } from "../middleware/admin.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/group-by-interests", authenticate, authorizeAdmin, groupUsersByInterest);
router.get("/:id/posts", authenticate, getUserPosts);
router.get("/me", authenticate, getCurrentUser);
router.get("/", authenticate, authorizeAdmin, getAllUsers);

export default router;
