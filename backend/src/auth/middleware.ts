import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload, Role } from "./jwt";

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// リクエストヘッダーのBearerトークンを検証し、req.userにセットする
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ status: "error", message: "認証が必要です" });
  }

  const token = header.slice("Bearer ".length);
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ status: "error", message: "トークンが無効です" });
  }
}

// 特定のrole(student/staff)のみアクセスを許可する
export function requireRole(role: Role) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ status: "error", message: "権限がありません" });
    }
    next();
  };
}
