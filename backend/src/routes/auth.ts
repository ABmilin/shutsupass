import { Router } from "express";
import { pool } from "../db";
import { hashPassword, comparePassword } from "../auth/hash";
import { generateToken } from "../auth/jwt";
import { requireAuth, AuthRequest } from "../auth/middleware";

const router = Router();

function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase();
}

// 新規登録
// 職員(role: staff)は、パスワードリセット用に秘密の質問・答えの入力が必須
router.post("/register", async (req, res) => {
  const { role, loginId, password, displayName, securityQuestion, securityAnswer } = req.body;

  if (!role || !loginId || !password || !displayName) {
    return res.status(400).json({ status: "error", message: "すべての項目を入力してください" });
  }
  if (role !== "student" && role !== "staff") {
    return res.status(400).json({ status: "error", message: "roleが不正です" });
  }
  if (role === "staff" && (!securityQuestion || !securityAnswer)) {
    return res.status(400).json({ status: "error", message: "秘密の質問と答えを入力してください" });
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE login_id = $1", [loginId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ status: "error", message: "このIDは既に使われています" });
    }

    const passwordHash = await hashPassword(password);
    const securityAnswerHash =
      role === "staff" ? await hashPassword(normalizeAnswer(securityAnswer)) : null;

    const result = await pool.query(
      `INSERT INTO users (role, login_id, password_hash, display_name, security_question, security_answer_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, role, login_id, display_name`,
      [role, loginId, passwordHash, displayName, role === "staff" ? securityQuestion : null, securityAnswerHash]
    );

    const user = result.rows[0];
    const token = generateToken({ userId: user.id, role: user.role, displayName: user.display_name });

    res.status(201).json({
      status: "ok",
      token,
      user: { id: user.id, role: user.role, loginId: user.login_id, displayName: user.display_name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "登録に失敗しました" });
  }
});

// ログイン
router.post("/login", async (req, res) => {
  const { loginId, password } = req.body;

  if (!loginId || !password) {
    return res.status(400).json({ status: "error", message: "IDとパスワードを入力してください" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE login_id = $1", [loginId]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ status: "error", message: "IDまたはパスワードが違います" });
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ status: "error", message: "IDまたはパスワードが違います" });
    }

    const token = generateToken({ userId: user.id, role: user.role, displayName: user.display_name });

    res.json({
      status: "ok",
      token,
      user: { id: user.id, role: user.role, loginId: user.login_id, displayName: user.display_name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "ログインに失敗しました" });
  }
});

// 秘密の質問を取得(職員のみ。存在しないIDでも同じエラーにして、IDの存在を推測されないようにする)
router.post("/forgot-password/question", async (req, res) => {
  const { loginId } = req.body;
  if (!loginId) {
    return res.status(400).json({ status: "error", message: "IDを入力してください" });
  }

  try {
    const result = await pool.query(
      "SELECT security_question FROM users WHERE login_id = $1 AND role = 'staff'",
      [loginId]
    );
    const user = result.rows[0];
    if (!user || !user.security_question) {
      return res.status(404).json({ status: "error", message: "該当するアカウントが見つかりません" });
    }
    res.json({ status: "ok", securityQuestion: user.security_question });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "取得に失敗しました" });
  }
});

// 秘密の質問の答えを確認し、新しいパスワードを設定する(職員のみ)
router.post("/forgot-password/reset", async (req, res) => {
  const { loginId, answer, newPassword } = req.body;
  if (!loginId || !answer || !newPassword) {
    return res.status(400).json({ status: "error", message: "すべての項目を入力してください" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ status: "error", message: "パスワードは8文字以上にしてください" });
  }

  try {
    const result = await pool.query(
      "SELECT id, security_answer_hash FROM users WHERE login_id = $1 AND role = 'staff'",
      [loginId]
    );
    const user = result.rows[0];
    if (!user || !user.security_answer_hash) {
      return res.status(404).json({ status: "error", message: "該当するアカウントが見つかりません" });
    }

    const valid = await comparePassword(normalizeAnswer(answer), user.security_answer_hash);
    if (!valid) {
      return res.status(401).json({ status: "error", message: "答えが正しくありません" });
    }

    const newHash = await hashPassword(newPassword);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, user.id]);

    res.json({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "パスワードの再設定に失敗しました" });
  }
});

// ログイン中のパスワード変更(学生・職員共通)
router.patch("/change-password", requireAuth, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ status: "error", message: "すべての項目を入力してください" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ status: "error", message: "新しいパスワードは8文字以上にしてください" });
  }

  try {
    const result = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user!.userId]);
    const user = result.rows[0];

    const valid = await comparePassword(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ status: "error", message: "現在のパスワードが正しくありません" });
    }

    const newHash = await hashPassword(newPassword);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, req.user!.userId]);

    res.json({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "パスワードの変更に失敗しました" });
  }
});

export default router;
