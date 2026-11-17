import type { UserRoute } from "./UserRole.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRoute;
      };
    }
  }
}

export {};
