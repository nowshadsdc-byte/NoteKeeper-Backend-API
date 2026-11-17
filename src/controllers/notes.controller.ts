
import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import * as NoteService from "../services/note.service.js";

// Create Note Controller
export const createNote = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // 1. Get authenticated user ID
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    // 2. Extract request body
    const { title, content } = req.body;

    // 3. Validate input
    if (
      typeof title !== "string" ||
      typeof content !== "string" ||
      !title.trim() ||
      !content.trim()
    ) {
      res.status(400).json({
        success: false,
        message: "Title and content are required",
      });
      return;
    }

    if (title.trim().length > 150) {
      res.status(400).json({
        success: false,
        message: "Title cannot exceed 150 characters",
      });
      return;
    }

    // 4. Call Note Service
    const note = await NoteService.createNote({
      title: title.trim(),
      content: content.trim(),
      user: userId,
    });

    // 5. Send success response
    res.status(201).json({
      success: true,
      message: "Note created successfully",
      data: note,
    });
  } catch (error) {
    console.error("Create Note Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create note",
    });
  }
};

const isValidNoteId = (id: string): boolean =>
  /^[a-f\d]{24}$/i.test(id) && Types.ObjectId.isValid(id);

const parsePaginationValue = (
  value: unknown,
  defaultValue: number,
  maximum?: number,
): number | null => {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    (maximum !== undefined && parsed > maximum)
  ) {
    return null;
  }

  return parsed;
};

export const getNoteById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user?.id;

  if (typeof id !== "string" || !isValidNoteId(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid note ID",
    });
    return;
  }

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  try {
    const note = await NoteService.getOwnedNote(id, userId);
    if (!note) {
      res.status(404).json({
        success: false,
        message: "Note not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Note retrieved successfully",
      data: note,
    });
  } catch (error) {
    next(error);
  }
};

export const updateNote = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user?.id;

  if (typeof id !== "string" || !isValidNoteId(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid note ID",
    });
    return;
  }

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  if (
    typeof req.body !== "object" ||
    req.body === null ||
    Array.isArray(req.body)
  ) {
    res.status(400).json({
      success: false,
      message: "Request body must be a JSON object",
    });
    return;
  }

  const updates: NoteService.UpdateNoteData = {};
  for (const field of ["title", "content"] as const) {
    const value: unknown = req.body[field];
    if (value === undefined) {
      continue;
    }

    if (typeof value !== "string" || !value.trim()) {
      res.status(400).json({
        success: false,
        message: `${field} must be a non-empty string`,
      });
      return;
    }

    const trimmedValue = value.trim();
    if (field === "title" && trimmedValue.length > 150) {
      res.status(400).json({
        success: false,
        message: "Title cannot exceed 150 characters",
      });
      return;
    }

    updates[field] = trimmedValue;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({
      success: false,
      message: "At least one of title or content is required",
    });
    return;
  }

  try {
    const note = await NoteService.updateOwnedNote(id, userId, updates);
    if (!note) {
      res.status(404).json({
        success: false,
        message: "Note not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Note updated successfully",
      data: note,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteNote = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user?.id;

  if (typeof id !== "string" || !isValidNoteId(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid note ID",
    });
    return;
  }

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  try {
    const note = await NoteService.deleteOwnedNote(id, userId);
    if (!note) {
      res.status(404).json({
        success: false,
        message: "Note not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Note deleted successfully",
      data: note,
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminNotes = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const page = parsePaginationValue(req.query.page, 1);
  const limit = parsePaginationValue(req.query.limit, 10, 100);

  if (
    page === null ||
    limit === null ||
    !Number.isSafeInteger((page - 1) * limit)
  ) {
    res.status(400).json({
      success: false,
      message:
        "Page must be a positive integer and limit must be an integer between 1 and 100",
    });
    return;
  }

  try {
    const { notes, total } = await NoteService.listAllNotes({ page, limit });

    res.status(200).json({
      success: true,
      message: "Notes retrieved successfully",
      data: notes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};
