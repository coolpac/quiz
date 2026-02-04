import type { Visitor } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      visitor?: Visitor;
      isAdmin?: boolean;
    }
  }
}

export {};
