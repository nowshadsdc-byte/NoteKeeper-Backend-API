import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { UserModel } from "../models/User.js";

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  interests?: string[];
}

export interface LoginUserInput {
  email: string;
  password: string;
}

export interface ListUsersInput {
  page: number;
  limit: number;
}

export interface ListUserPostsInput {
  userId: string;
  page: number;
  limit: number;
}

export interface UsersByInterestResult {
  interest: string;
  users: Array<{
    _id: Types.ObjectId;
    name: string;
    email: string;
    role: string;
  }>;
  totalUsers: number;
}

export interface UserWithPostsResult {
  user: {
    _id: Types.ObjectId;
    name: string;
    email: string;
  };
  posts: Array<{
    _id: Types.ObjectId;
    title: string;
    content: string;
    userId: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
  }>;
  totalPosts: number;
}

export const createUser = async (user: CreateUserInput) => {

    // Hash the password before saving it to the database.
    const hashedPassword = await bcrypt.hash(user.password, 12);
  return UserModel.create({
    id: new Date().getTime().toString(),
    name: user.name.trim(),
    email: user.email.trim().toLowerCase(),
    password: hashedPassword,
    role: "user",
    interests: user.interests ?? [],
  });
};

export const authenticateUser = async ({ email, password }: LoginUserInput) => {
  const user = await UserModel.findOne({
    email: email.trim().toLowerCase(),
  }).select("+password");

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return null;
  }

  return user;
};

export const getUserProfile = async (userId: string) =>
  UserModel.findById(userId)
    .select("name email role interests createdAt updatedAt")
    .lean();

export const listUsers = async ({ page, limit }: ListUsersInput) => {
  const [users, totalUsers] = await Promise.all([
    UserModel.find()
      .select("_id name email role interests createdAt")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    UserModel.countDocuments(),
  ]);

  return { users, totalUsers };
};

export const groupUsersByInterest = () =>
  UserModel.aggregate<UsersByInterestResult>([
    {
      $project: {
        _id: 1,
        name: 1,
        email: 1,
        role: 1,
        interests: 1,
      },
    },
    {
      $unwind: {
        path: "$interests",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $group: {
        _id: {
          interest: {
            $cond: [
              { $eq: [{ $type: "$interests" }, "string"] },
              {
                $cond: [
                  { $eq: [{ $trim: { input: "$interests" } }, ""] },
                  "No interests",
                  { $trim: { input: "$interests" } },
                ],
              },
              "No interests",
            ],
          },
          userId: "$_id",
        },
        user: {
          $first: {
            _id: "$_id",
            name: "$name",
            email: "$email",
            role: "$role",
          },
        },
      },
    },
    {
      $group: {
        _id: "$_id.interest",
        users: { $push: "$user" },
        totalUsers: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        interest: "$_id",
        users: 1,
        totalUsers: 1,
      },
    },
    { $sort: { interest: 1 } },
  ]).exec();

export const getUserWithPosts = ({
  userId,
  page,
  limit,
}: ListUserPostsInput) => {
  const skip = (page - 1) * limit;

  return UserModel.aggregate<UserWithPostsResult>([
    {
      $match: {
        _id: new Types.ObjectId(userId),
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        email: 1,
      },
    },
    {
      $lookup: {
        from: "posts",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$userId", "$$userId"],
              },
            },
          },
          {
            $facet: {
              posts: [
                { $sort: { createdAt: -1, _id: -1 } },
                { $skip: skip },
                { $limit: limit },
                {
                  $project: {
                    _id: 1,
                    title: 1,
                    content: 1,
                    userId: 1,
                    createdAt: 1,
                    updatedAt: 1,
                  },
                },
              ],
              total: [{ $count: "count" }],
            },
          },
        ],
        as: "postPage",
      },
    },
    { $unwind: "$postPage" },
    {
      $project: {
        _id: 0,
        user: {
          _id: "$_id",
          name: "$name",
          email: "$email",
        },
        posts: { $ifNull: ["$postPage.posts", []] },
        totalPosts: {
          $ifNull: [{ $arrayElemAt: ["$postPage.total.count", 0] }, 0],
        },
      },
    },
  ]).exec();
};
