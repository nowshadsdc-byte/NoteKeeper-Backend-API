import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { createAccessToken } from "../config/jwt.js";
import {
  authenticateUser,
  createUser as createUserService,
  getUserWithPosts as getUserWithPostsService,
  groupUsersByInterest as groupUsersByInterestService,
  getUserProfile,
  listUsers as listUsersService,
} from "../services/user.service.js";


const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isDuplicateEmailError = (error: unknown, email: string): boolean => {
  if (
    !isRecord(error) ||
    error.code !== 11000 ||
    !isRecord(error.keyPattern) ||
    !isRecord(error.keyValue)
  ) {
    return false;
  }

  const keyFields = Object.keys(error.keyPattern);
  return (
    keyFields.length === 1 &&
    error.keyPattern.email === 1 &&
    error.keyValue.email === email
  );
};

export const createUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!isRecord(req.body)) {
    res.status(400).json({
      success: false,
      message: "Request body must be a JSON object",
    });
    return;
  }

  const { name, email, password, interests: rawInterests } = req.body;

  const normalizedName = typeof name === "string" ? name.trim() : "";
  
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  if (
    !normalizedName ||
    !normalizedEmail ||
    typeof password !== "string" ||
    !password
  ) {
    res.status(400).json({
      success: false,
      message: "Name, email, and password are required",
    });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({
      success: false,
      message: "A valid email address is required",
    });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters long",
    });
    return;
  }

  if (rawInterests !== undefined && !isStringArray(rawInterests)) {
    res.status(400).json({
      success: false,
      message: "Interests must be an array of strings",
    });
    return;
  }

  try {
    const user = await createUserService({
      name: normalizedName,
      email: normalizedEmail,
      password,
      interests: rawInterests
        ?.map((interest) => interest.trim())
        .filter(Boolean),
    });
    const { password: _password, ...safeUser } = user.toObject();

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: safeUser,
    });
  } catch (error) {
    if (isDuplicateEmailError(error, normalizedEmail)) {
      res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
      return;
    }

    next(error);
  }
};

export const loginUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {


// Log the request body for debugging
  
  if (!isRecord(req.body)) {
    res.status(400).json({
      success: false,
      message: "Request body must be a JSON object",
    });
    return;
  }

  const { email, password } = req.body;
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    typeof password !== "string" ||
    password.length === 0
  ) {
    res.status(400).json({
      success: false,
      message: "A valid email and password are required",
    });
    return;
  }

  try {
    const user = await authenticateUser({
      email: normalizedEmail,
      password,
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    const accessToken = createAccessToken(user._id.toString(), user.role);
    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          _id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
        },
        accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authenticated user ID is required",
    });
    return;
  }

  try {
    const user = await getUserProfile(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Profile retrieved successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

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

export const getAllUsers = async (
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
    const { users, totalUsers } = await listUsersService({ page, limit });

    res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: {
        users,
        pagination: {
          currentPage: page,
          limit,
          totalUsers,
          totalPages: Math.ceil(totalUsers / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const isValidObjectIdParam = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[a-f\d]{24}$/i.test(id) &&
  Types.ObjectId.isValid(id);

export const groupUsersByInterest = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const groups = await groupUsersByInterestService();

    res.status(200).json({
      success: true,
      message: "Users grouped by interests",
      data: groups,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserPosts = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { id } = req.params;
  if (!isValidObjectIdParam(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid user ID",
    });
    return;
  }

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
    const [result] = await getUserWithPostsService({
      userId: id,
      page,
      limit,
    });

    if (!result) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "User posts retrieved successfully",
      data: {
        user: result.user,
        posts: result.posts,
        pagination: {
          page,
          limit,
          total: result.totalPosts,
          totalPages: Math.ceil(result.totalPosts / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
