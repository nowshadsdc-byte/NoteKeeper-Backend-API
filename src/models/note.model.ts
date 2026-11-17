
import mongoose, { Document, Model, Schema, Types } from "mongoose";

// 1. Note Interface
export interface INote extends Document {
  title: string;
  content: string;
  user: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// 2. Note Schema
const noteSchema = new Schema<INote>(
  {
    title: {
      type: String,
      required: [true, "Note title is required"],
      trim: true,
      minlength: [1, "Title cannot be empty"],
      maxlength: [150, "Title cannot exceed 150 characters"],
    },

    content: {
      type: String,
      required: [true, "Note content is required"],
      trim: true,
      minlength: [1, "Content cannot be empty"],
    },

    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Note owner is required"],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// 3. Database Indexes

// Efficiently retrieve a user's notes with newest first.
noteSchema.index({
  user: 1,
  createdAt: -1,
  _id: -1,
});

// Efficiently retrieve all notes sorted by creation date.
noteSchema.index({
  createdAt: -1,
  _id: -1,
});

// 4. Note Model
const Note: Model<INote> =
  mongoose.models.Note ||
  mongoose.model<INote>("Note", noteSchema);

export default Note;
