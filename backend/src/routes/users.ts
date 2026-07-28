import { Router } from "express";
import crypto from "crypto";
import { pool } from "../db";
import { hashPassword } from "../auth/hash";
import { requireAuth, requireRole } from "../auth/middleware";

const router = Router();

// 学生を検索(窓口でのパスワードリセット対象を探すため。職員のみ)
router.get("/students", requireAuth, requireRole("staff"), async (req, res) => {
  const { search } = req.query;

  try {
    const result = await pool.query(
      `SELECT id, login_id, display_name FROM users
       WHERE role = 'student' AND ($1::text IS NULL OR login_id ILIKE $1 OR display_name ILIKE $1)
       ORDER BY display_name
       LIMIT 20`,
      [search ? `%${search}%` : null]
    );
    res.json({ status: "ok", students: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "検索に失敗しました" });
  }
});

// 学生のパスワードを一時パスワードにリセット(窓口での本人確認後に職員が実行する想定)
router.post("/:id/reset-password", requireAuth, requireRole("staff"), async (req, res) => {
  const { id } = req.params;

  try {
    const target = await pool.query("SELECT id, role FROM users WHERE id = $1", [id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "ユーザーが見つかりません" });
    }
    if (target.rows[0].role !== "student") {
      return res.status(400).json({ status: "error", message: "学生のみリセットできます" });
    }

    // 8文字のランダムな一時パスワードを生成(読み間違いにくい文字セット)
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const tempPassword = Array.from({ length: 8 }, () => chars[crypto.randomInt(chars.length)]).join("");

    const passwordHash = await hashPassword(tempPassword);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, id]);

    res.json({ status: "ok", tempPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "パスワードのリセットに失敗しました" });
  }
});

export default router;
