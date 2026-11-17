import { model, Schema, Types } from "mongoose";

export interface IPost {
  title: string;
  content: string;
  userId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const postSchema = new Schema<IPost>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

postSchema.index({ userId: 1, createdAt: -1, _id: -1 });

const Post =
  model<IPost>("Post", postSchema, "posts");

export default Post;
