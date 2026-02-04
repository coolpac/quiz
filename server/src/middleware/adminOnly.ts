import type { Request, Response, NextFunction } from "express";

export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAdmin) {
    res.status(403).json({ error: "Доступ запрещён" });
    return;
  }
  next();
};
