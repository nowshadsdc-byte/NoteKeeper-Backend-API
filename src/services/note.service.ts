
import mongoose, { Types } from "mongoose";
import Note from "../models/note.model.js";

// Create Note Data Interface
interface CreateNoteData {
  title: string;
  content: string;
  user: string;
}

export interface UpdateNoteData {
  title?: string;
  content?: string;
}

export interface ListNotesInput {
  page: number;
  limit: number;
}

// Create Note Service
export const createNote = async (
  data: CreateNoteData
) => {
  // 1. Validate User ID
  if (!mongoose.isValidObjectId(data.user)) {
    throw new Error("INVALID_USER_ID");
  }

  // 2. Create Note
  const note = await Note.create({
    title: data.title,
    content: data.content,
    user: new Types.ObjectId(data.user),
  });

  // 3. Return created Note
  return note;
};

export const getOwnedNote = (noteId: string, userId: string) =>
  Note.findOne({
    _id: noteId,
    user: userId,
  }).lean();

export const updateOwnedNote = (
  noteId: string,
  userId: string,
  updates: UpdateNoteData,
) =>
  Note.findOneAndUpdate(
    {
      _id: noteId,
      user: userId,
    },
    {
      $set: updates,
    },
    {
      new: true,
      runValidators: true,
    },
  ).lean();

export const deleteOwnedNote = (noteId: string, userId: string) =>
  Note.findOneAndDelete({
    _id: noteId,
    user: userId,
  }).lean();

export const listAllNotes = async ({ page, limit }: ListNotesInput) => {
  const [notes, total] = await Promise.all([
    Note.find()
      .populate({
        path: "user",
        select: "name email",
      })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Note.countDocuments(),
  ]);

  return { notes, total };
};
