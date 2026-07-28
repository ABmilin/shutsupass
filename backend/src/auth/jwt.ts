import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "devsecret_change_me";

export type Role = "student" | "staff";

export interface JwtPayload {
  userId: number;
  role: Role;
  displayName: string;
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
