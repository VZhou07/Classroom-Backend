import type { SessionUser } from "./types/session.js";
import type { Class } from "./db/schema/app.js";

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      classId?: number;
      classRecord?: Class;
    }
  }
}

export {};
