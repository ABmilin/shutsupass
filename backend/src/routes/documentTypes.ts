import { Router } from "express";
import { pool } from "../db";
import { requireAuth, requireRole, AuthRequest } from "../auth/middleware";

const router = Router();

interface RequiredField {
  key: string;
  label: string;
  type: string;
}

function validateRequiredFields(fields: unknown): fields is RequiredField[] {
  if (!Array.isArray(fields)) return false;
  return fields.every(
    (f) =>
      f &&
      typeof f.key === "string" &&
      /^[a-z][a-z0-9_]*$/.test(f.key) &&
      typeof f.label === "string" &&
      f.label.length > 0 &&
      ["text", "month", "date"].includes(f.type)
  );
}

// 申請書の種類一覧(申請フォームで使う。学生・職員共通)
router.get("/", requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, code, name, fee, required_fields, layout FROM document_types ORDER BY id"
    );
    res.json({ status: "ok", documentTypes: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "申請書種類の取得に失敗しました" });
  }
});

// 新しい申請書の種類を追加(職員のみ)
router.post("/", requireAuth, requireRole("staff"), async (req: AuthRequest, res) => {
  const { code, name, fee, requiredFields } = req.body;

  if (!code || !name || fee === undefined || fee === null) {
    return res.status(400).json({ status: "error", message: "すべての項目を入力してください" });
  }
  if (!/^[a-z][a-z0-9_]*$/.test(code)) {
    return res.status(400).json({ status: "error", message: "種類コードは半角英小文字・数字・アンダースコアのみ使用できます" });
  }
  const feeNum = Number(fee);
  if (Number.isNaN(feeNum) || feeNum < 0) {
    return res.status(400).json({ status: "error", message: "手数料は0以上の数値で入力してください" });
  }
  if (!validateRequiredFields(requiredFields ?? [])) {
    return res.status(400).json({
      status: "error",
      message: "入力項目の形式が不正です（キーは半角英数字・アンダースコア、種類はtext/month/dateのいずれか）",
    });
  }

  try {
    const existing = await pool.query("SELECT id FROM document_types WHERE code = $1", [code]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ status: "error", message: "この種類コードは既に使われています" });
    }

    const result = await pool.query(
      `INSERT INTO document_types (code, name, fee, required_fields)
       VALUES ($1, $2, $3, $4)
       RETURNING id, code, name, fee, required_fields`,
      [code, name, feeNum, JSON.stringify(requiredFields ?? [])]
    );

    res.status(201).json({ status: "ok", documentType: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "申請書種類の追加に失敗しました" });
  }
});

// 既存の申請書の種類を編集(職員のみ。種類コードは変更不可)
router.patch("/:id", requireAuth, requireRole("staff"), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { name, fee, requiredFields } = req.body;

  if (!name || fee === undefined || fee === null) {
    return res.status(400).json({ status: "error", message: "すべての項目を入力してください" });
  }
  const feeNum = Number(fee);
  if (Number.isNaN(feeNum) || feeNum < 0) {
    return res.status(400).json({ status: "error", message: "手数料は0以上の数値で入力してください" });
  }
  if (!validateRequiredFields(requiredFields ?? [])) {
    return res.status(400).json({
      status: "error",
      message: "入力項目の形式が不正です（キーは半角英数字・アンダースコア、種類はtext/month/dateのいずれか）",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE document_types
       SET name = $1, fee = $2, required_fields = $3
       WHERE id = $4
       RETURNING id, code, name, fee, required_fields`,
      [name, feeNum, JSON.stringify(requiredFields ?? []), id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "申請書の種類が見つかりません" });
    }
    res.json({ status: "ok", documentType: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "申請書種類の更新に失敗しました" });
  }
});

// 帳票プレビューの配置情報を保存(職員のみ)
// layout: { [フィールドキー]: { top: "80mm", left: "30mm" }, ... }
router.patch("/:id/layout", requireAuth, requireRole("staff"), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { layout } = req.body;

  if (typeof layout !== "object" || layout === null || Array.isArray(layout)) {
    return res.status(400).json({ status: "error", message: "レイアウトの形式が不正です" });
  }
  for (const key of Object.keys(layout)) {
    const pos = layout[key];
    if (!pos || typeof pos.top !== "string" || typeof pos.left !== "string") {
      return res.status(400).json({ status: "error", message: `項目「${key}」の配置情報が不正です` });
    }
  }

  try {
    const result = await pool.query(
      `UPDATE document_types SET layout = $1 WHERE id = $2 RETURNING id, code, name, fee, required_fields, layout`,
      [JSON.stringify(layout), id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "申請書の種類が見つかりません" });
    }
    res.json({ status: "ok", documentType: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "レイアウトの保存に失敗しました" });
  }
});

export default router;
