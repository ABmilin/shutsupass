import { Router } from "express";
import { pool } from "../db";
import { requireAuth, AuthRequest } from "../auth/middleware";

const router = Router();

// 自分宛の通知一覧(新しい順、最大30件)
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT id, application_id, message, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.user!.userId]
    );
    res.json({ status: "ok", notifications: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "通知の取得に失敗しました" });
  }
});

// 1件を既読にする
router.patch("/:id/read", requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2",
      [id, req.user!.userId]
    );
    res.json({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "更新に失敗しました" });
  }
});

// すべて既読にする
router.patch("/read-all", requireAuth, async (req: AuthRequest, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false",
      [req.user!.userId]
    );
    res.json({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "更新に失敗しました" });
  }
});

export default router;
