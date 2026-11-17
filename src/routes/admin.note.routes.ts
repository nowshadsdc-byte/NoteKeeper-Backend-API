import express from "express";
import { getAdminNotes } from "../controllers/notes.controller.js";
import { authorizeAdmin } from "../middleware/admin.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, authorizeAdmin, getAdminNotes);

export default router;
