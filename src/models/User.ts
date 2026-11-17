import { model, Schema } from "mongoose";
import { UserRoute } from "../types/UserRole.js";
// user roles

//interface
export interface IUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRoute;
  interests: string[];
  createdAt?: Date;
  updatedAt?: Date;
}
//Schema
const userSchema = new Schema<IUser>(
  {
    id:{
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    interests: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);


userSchema.index({ email: 1 }, { unique: true });



//  Model
export const UserModel = model<IUser>("User", userSchema);
