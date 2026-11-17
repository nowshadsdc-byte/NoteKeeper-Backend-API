import express, {
  type Application,
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import cors from "cors";

import profileRoute from "./routes/profile.routes.js";
import userRoute from "./routes/user.routes.js";
import noteRoute from "./routes/note.route.js";
import adminNoteRoute from "./routes/admin.note.routes.js";
import postRoute from "./routes/posts.routes.js";
import "./models/Post.js";

const app: Application = express();
// Global middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/api/health", (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: "SecureNotes API is running",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth/", userRoute);
app.use("/api/users", profileRoute);
app.use("/api/notes", noteRoute);
app.use("/api/admin/notes", adminNoteRoute);
app.use("/api/posts", postRoute);


//API Endpoint
app.get("/", (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: "SecureNotes API is running",
    timestamp: new Date().toISOString(),
  });
});

const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  console.error("Unhandled request error:", error);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

app.use(errorHandler);

export default app;
