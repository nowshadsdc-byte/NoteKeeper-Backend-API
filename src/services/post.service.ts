import { Types } from "mongoose";
import Post from "../models/Post.js";

export interface CreatePostInput {
  title: string;
  content: string;
  userId: string;
}

export const createPost = ({ title, content, userId }: CreatePostInput) =>
  Post.create({
    title,
    content,
    userId: new Types.ObjectId(userId),
  });
