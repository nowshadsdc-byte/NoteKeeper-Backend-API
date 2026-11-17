import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as noteController from '../controllers/notes.controller.js';
const router = express.Router();

router.get('/', authenticate, (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Notes retrieved successfully",
  });
});
router.post('/', authenticate,noteController.createNote);

router.get('/:id', authenticate, noteController.getNoteById);
router.put('/:id', authenticate, noteController.updateNote);
router.delete('/:id', authenticate, noteController.deleteNote);

export default router;
