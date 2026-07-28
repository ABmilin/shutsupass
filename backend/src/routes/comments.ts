import { Router } from "express";
import { pool } from "../db";
import { requireAuth, AuthRequest } from "../auth/middleware";
import { notifyUser, notifyAllStaff } from "../notifications/create";

const router = Router();

// アクセス権限の確認(申請者本人または職員のみ)
async function canAccess(applicationId: string, userId: number, role: string): Promise<{ ok: boolean; studentId?: number; documentTypeName?: string }> {
  const result = await pool.query(
    `SELECT a.student_id, dt.name AS document_type_name
     FROM applications a
     JOIN document_types dt ON dt.id = a.document_type_id
     WHERE a.id = $1`,
    [applicationId]
  );
  const app = result.rows[0];
  if (!app) return { ok: false };
  if (role === "staff") return { ok: true, studentId: app.student_id, documentTypeName: app.document_type_name };
  if (role === "student" && app.student_id === userId) return { ok: true, studentId: app.student_id, documentTypeName: app.document_type_name };
  return { ok: false };
}

// 申請ごとのメッセージ一覧
router.get("/:id/comments", requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const access = await canAccess(id, req.user!.userId, req.user!.role);
  if (!access.ok) {
    return res.status(403).json({ status: "error", message: "アクセス権限がありません" });
  }

  try {
    const result = await pool.query(
      `SELECT c.id, c.sender_role, c.message, c.created_at, u.display_name AS sender_name
       FROM application_comments c
       JOIN users u ON u.id = c.sender_id
       WHERE c.application_id = $1
       ORDER BY c.created_at ASC`,
      [id]
    );
    res.json({ status: "ok", comments: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "メッセージの取得に失敗しました" });
  }
});

// メッセージを送る
router.post("/:id/comments", requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ status: "error", message: "メッセージを入力してください" });
  }

  const access = await canAccess(id, req.user!.userId, req.user!.role);
  if (!access.ok) {
    return res.status(403).json({ status: "error", message: "アクセス権限がありません" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO application_comments (application_id, sender_id, sender_role, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, sender_role, message, created_at`,
      [id, req.user!.userId, req.user!.role, message.trim()]
    );

    // 相手側に通知する
    if (req.user!.role === "staff") {
      await notifyUser(access.studentId!, `${access.documentTypeName}の申請について、職員からメッセージが届いています。`, Number(id));
    } else {
      await notifyAllStaff(`${req.user!.displayName}さんから${access.documentTypeName}の申請についてメッセージが届いています。`, Number(id));
    }

    res.status(201).json({ status: "ok", comment: { ...result.rows[0], sender_name: req.user!.displayName } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "メッセージの送信に失敗しました" });
  }
});

export default router;
