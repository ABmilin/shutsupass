import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db";
import authRouter from "./routes/auth";
import documentTypesRouter from "./routes/documentTypes";
import applicationsRouter from "./routes/applications";
import commentsRouter from "./routes/comments";
import usersRouter from "./routes/users";
import notificationsRouter from "./routes/notifications";
import translateRouter from "./routes/translate";
import { requireAuth, AuthRequest } from "./auth/middleware";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

app.use("/api/auth", authRouter);
app.use("/api/document-types", documentTypesRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/applications", commentsRouter);
app.use("/api/users", usersRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/translate", translateRouter);

// 動作確認用: ログイン中のユーザー情報を返す(要認証)
app.get("/api/me", requireAuth, (req: AuthRequest, res) => {
  res.json({ status: "ok", user: req.user });
});

// 動作確認用: サーバーが起動しているか
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "shutsupass-backend" });
});

// 動作確認用: DBコンテナに接続できているか
app.get("/api/db-check", async (_req, res) => {
  try {
    const result = await pool.query("SELECT note, created_at FROM schema_info ORDER BY id DESC LIMIT 1");
    res.json({ status: "ok", db: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "DB接続に失敗しました" });
  }
});

app.listen(PORT, () => {
  console.log(`ShutsuPass backend listening on port ${PORT}`);
});
