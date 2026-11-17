import type { NextFunction, Request, Response } from "express";
import { createPost as createPostService } from "../services/post.service.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const createPost = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  if (!isRecord(req.body)) {
    res.status(400).json({
      success: false,
      message: "Request body must be a JSON object",
    });
    return;
  }

  const { title, content } = req.body;
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

  const normalizedTitle = title.trim();
  if (normalizedTitle.length > 150) {
    res.status(400).json({
      success: false,
      message: "Title cannot exceed 150 characters",
    });
    return;
  }

  try {
    const post = await createPostService({
      title: normalizedTitle,
      content: content.trim(),
      userId,
    });

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      data: post,
    });
  } catch (error) {
    next(error);
  }
};
