import { Router } from "express";
import crypto from "crypto";
import { pool } from "../db";
import { requireAuth, requireRole, AuthRequest } from "../auth/middleware";
import { notifyUser, notifyAllStaff } from "../notifications/create";
import { ApplicationPdfData, renderApplicationPdf } from "../pdf/applicationPdf";

const router = Router();

interface RequiredField {
  key: string;
  label: string;
  type: string;
}

// 新規申請(学生のみ)
router.post("/", requireAuth, requireRole("student"), async (req: AuthRequest, res) => {
  const { documentTypeId, copies, formData, receiveMethod, purpose, purposeDetail, needsSealing, sealGroupLabel, groupId } = req.body;
  const studentId = req.user!.userId;

  if (!documentTypeId || !receiveMethod) {
    return res.status(400).json({ status: "error", message: "必要な項目が不足しています" });
  }
  if (receiveMethod !== "download" && receiveMethod !== "window") {
    return res.status(400).json({ status: "error", message: "受け取り方法が不正です" });
  }
  const purposeValue = purpose === "job_hunting" ? "job_hunting" : "other";
  const copiesNum = Number(copies) || 1;
  if (copiesNum < 1) {
    return res.status(400).json({ status: "error", message: "部数は1以上を指定してください" });
  }

  try {
    const typeResult = await pool.query(
      "SELECT id, name, fee, required_fields FROM document_types WHERE id = $1",
      [documentTypeId]
    );
    const docType = typeResult.rows[0];
    if (!docType) {
      return res.status(404).json({ status: "error", message: "証明書の種類が見つかりません" });
    }

    // 必須項目が入力されているか確認
    const requiredFields: RequiredField[] = docType.required_fields;
    const missing = requiredFields.filter((f) => !formData?.[f.key]);
    if (missing.length > 0) {
      return res.status(400).json({
        status: "error",
        message: `未入力の項目があります: ${missing.map((f) => f.label).join("、")}`,
      });
    }

    const totalFee = docType.fee * copiesNum;

    // グループID: 指定があれば自分の既存グループか確認、なければ新規発行
    let finalGroupId: string = groupId;
    if (finalGroupId) {
      const ownershipCheck = await pool.query(
        "SELECT id FROM applications WHERE group_id = $1 AND student_id = $2 LIMIT 1",
        [finalGroupId, studentId]
      );
      if (ownershipCheck.rows.length === 0) {
        finalGroupId = crypto.randomUUID();
      }
    } else {
      finalGroupId = crypto.randomUUID();
    }

    const result = await pool.query(
      `INSERT INTO applications
         (student_id, document_type_id, copies, form_data, receive_method, purpose, purpose_detail, needs_sealing, seal_group_label, group_id, total_fee)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, status, total_fee, receive_method, created_at, group_id`,
      [studentId, documentTypeId, copiesNum, formData, receiveMethod, purposeValue, purposeDetail || null, !!needsSealing, needsSealing ? (sealGroupLabel || null) : null, finalGroupId, totalFee]
    );

    const groupTotalResult = await pool.query(
      "SELECT COALESCE(SUM(total_fee), 0) AS group_total, COUNT(*) AS group_count FROM applications WHERE group_id = $1",
      [finalGroupId]
    );

    await notifyAllStaff(
      `${req.user!.displayName}さんから${docType.name}の新規申請があります`,
      result.rows[0].id
    );
    await notifyUser(
      studentId,
      `${docType.name}を申請しました。${totalFee}円を窓口でお支払いください。`,
      result.rows[0].id
    );

    res.status(201).json({
      status: "ok",
      application: result.rows[0],
      groupTotal: Number(groupTotalResult.rows[0].group_total),
      groupCount: Number(groupTotalResult.rows[0].group_count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "申請の登録に失敗しました" });
  }
});

// 自分の申請一覧(学生のみ)
router.get("/mine", requireAuth, requireRole("student"), async (req: AuthRequest, res) => {
  const studentId = req.user!.userId;
  try {
    const result = await pool.query(
      `SELECT a.id, a.document_type_id, a.copies, a.form_data, a.receive_method,
              a.purpose, a.purpose_detail, a.needs_sealing, a.seal_group_label, a.group_id, a.total_fee, a.status,
              a.reject_reason, a.created_at, a.issued_at,
              dt.name AS document_type_name, dt.required_fields
       FROM applications a
       JOIN document_types dt ON dt.id = a.document_type_id
       WHERE a.student_id = $1
       ORDER BY a.created_at DESC`,
      [studentId]
    );
    res.json({ status: "ok", applications: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "申請一覧の取得に失敗しました" });
  }
});

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function getApplicationPdfData(id: string): Promise<ApplicationPdfData | null> {
  const result = await pool.query(
    `SELECT a.id, a.student_id, a.copies, a.form_data, a.receive_method,
            a.purpose, a.purpose_detail, a.needs_sealing, a.seal_group_label,
            a.total_fee, a.status, a.reject_reason, a.created_at, a.issued_at,
            dt.name AS document_type_name, dt.required_fields,
            u.login_id AS student_login_id, u.display_name AS student_name
     FROM applications a
     JOIN document_types dt ON dt.id = a.document_type_id
     JOIN users u ON u.id = a.student_id
     WHERE a.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

function sendPdf(res: import("express").Response, buffer: Buffer, filename: string) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
}

// 申請控えPDF。申請者本人、または職員が取得できる。
// これは公式な証明書ではなく、申請内容の控えとして使う。
router.get("/:id/receipt-pdf", requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const lang = req.query.lang === "en" || req.query.lang === "zh" ? req.query.lang : "ja";

  try {
    const application = await getApplicationPdfData(id);
    if (!application) {
      return res.status(404).json({ status: "error", message: "申請が見つかりません" });
    }
    if (req.user!.role !== "staff" && application.student_id !== req.user!.userId) {
      return res.status(403).json({ status: "error", message: "アクセス権限がありません" });
    }

    const pdf = await renderApplicationPdf(application, "student_receipt", lang);
    sendPdf(res, pdf, `shutsupass_receipt_${application.id}_${lang}.pdf`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "申請控えPDFの生成に失敗しました" });
  }
});

// 職員作業票PDF。窓口処理の確認用であり、公式な証明書ではない。
router.get("/:id/work-sheet-pdf", requireAuth, requireRole("staff"), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const lang = req.query.lang === "en" || req.query.lang === "zh" ? req.query.lang : "ja";

  try {
    const application = await getApplicationPdfData(id);
    if (!application) {
      return res.status(404).json({ status: "error", message: "申請が見つかりません" });
    }

    const pdf = await renderApplicationPdf(application, "staff_work_sheet", lang);
    sendPdf(res, pdf, `shutsupass_work_sheet_${application.id}_${lang}.pdf`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "職員作業票PDFの生成に失敗しました" });
  }
});

// 支払い済みデータのCSV出力(総務課の集計作業向け。職員のみ)
// from/to: 申請日(created_at)での絞り込み(YYYY-MM-DD、任意)
router.get("/export", requireAuth, requireRole("staff"), async (req: AuthRequest, res) => {
  const { from, to } = req.query;

  const conditions: string[] = ["a.status IN ('payment_confirmed', 'issued', 'completed')"];
  const params: unknown[] = [];

  if (from) {
    params.push(from);
    conditions.push(`a.created_at >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    conditions.push(`a.created_at < ($${params.length}::date + interval '1 day')`);
  }

  try {
    const result = await pool.query(
      `SELECT a.id, a.created_at, u.login_id, u.display_name, dt.name AS document_type_name,
              a.copies, a.total_fee, a.status
       FROM applications a
       JOIN users u ON u.id = a.student_id
       JOIN document_types dt ON dt.id = a.document_type_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY a.created_at ASC`,
      params
    );

    const statusLabel: Record<string, string> = {
      payment_confirmed: "支払い確認済み",
      issued: "発行済み",
      completed: "受け渡し完了",
    };

    const header = ["申請ID", "申請日", "学籍番号", "氏名", "証明書名", "部数", "金額", "ステータス"];
    const rows = result.rows.map((r) => [
      r.id,
      new Date(r.created_at).toLocaleDateString("ja-JP"),
      r.login_id,
      r.display_name,
      r.document_type_name,
      r.copies,
      r.total_fee,
      statusLabel[r.status] ?? r.status,
    ]);

    // ExcelでUTF-8の日本語が文字化けしないよう、BOMを付与する
    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="shutsupass_export.csv"');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "CSV出力に失敗しました" });
  }
});

// ステータス別の件数集計(職員ダッシュボードの概況表示用)
router.get("/summary", requireAuth, requireRole("staff"), async (_req, res) => {
  try {
    // 対応待ちの件数(全期間) - 申請中/支払い確認済み/発行済みは、対応が終わるまで残り続けるキュー
    const pending = await pool.query("SELECT status, COUNT(*) AS count FROM applications GROUP BY status");
    const counts: Record<string, number> = {
      submitted: 0,
      payment_confirmed: 0,
      issued: 0,
      completed: 0,
      rejected: 0,
    };
    for (const row of pending.rows) {
      counts[row.status] = Number(row.count);
    }

    // 本日の実績
    // - 受け取り完了は積み上がり続けるため当日分のみに絞る
    // - 新規申請の件数も、その日の業務量を把握する目的で当日分を出す
    const todayCompleted = await pool.query(
      `SELECT COUNT(*) AS count FROM applications WHERE status = 'completed' AND updated_at::date = CURRENT_DATE`
    );
    const todayNew = await pool.query(
      `SELECT COUNT(*) AS count FROM applications WHERE created_at::date = CURRENT_DATE`
    );
    const todayCounts: Record<string, number> = {
      completed: Number(todayCompleted.rows[0].count),
      new: Number(todayNew.rows[0].count),
    };

    res.json({ status: "ok", counts, todayCounts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "集計の取得に失敗しました" });
  }
});

// 全申請一覧・検索(職員のみ)
// search: 学籍番号または氏名の部分一致 / status: ステータスで絞り込み
router.get("/", requireAuth, requireRole("staff"), async (req: AuthRequest, res) => {
  const { search, status } = req.query;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(u.login_id ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`);
  }
  if (status) {
    params.push(status);
    conditions.push(`a.status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `SELECT a.id, a.copies, a.form_data, a.receive_method, a.purpose, a.purpose_detail, a.needs_sealing, a.seal_group_label,
              a.group_id, a.total_fee, a.status,
              a.reject_reason, a.created_at, a.issued_at,
              dt.name AS document_type_name, dt.required_fields,
              u.login_id AS student_login_id, u.display_name AS student_name
       FROM applications a
       JOIN document_types dt ON dt.id = a.document_type_id
       JOIN users u ON u.id = a.student_id
       ${whereClause}
       ORDER BY a.created_at ASC`,
      params
    );
    res.json({ status: "ok", applications: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "申請一覧の取得に失敗しました" });
  }
});

// ステータス更新(職員のみ)
// action: confirm_payment | issue | complete | reject
// ※発行(issue)は、大学の既存の方法で証明書を作成したうえでの「発行準備完了」のステータス更新であり、
//   本システム自体は証明書の実体(PDF等)を生成しない。
const ALLOWED_TRANSITIONS: Record<string, { from: string; to: string }> = {
  confirm_payment: { from: "submitted", to: "payment_confirmed" },
  issue: { from: "payment_confirmed", to: "issued" },
  complete: { from: "issued", to: "completed" },
  reject: { from: "submitted", to: "rejected" },
};

router.patch("/:id/status", requireAuth, requireRole("staff"), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { action, reason } = req.body;

  const transition = ALLOWED_TRANSITIONS[action];
  if (!transition) {
    return res.status(400).json({ status: "error", message: "不正な操作です" });
  }
  if (action === "reject" && !reason) {
    return res.status(400).json({ status: "error", message: "却下理由を入力してください" });
  }

  try {
    const detail = await pool.query(
      `SELECT a.status, a.student_id, a.receive_method,
              dt.name AS document_type_name
       FROM applications a
       JOIN document_types dt ON dt.id = a.document_type_id
       WHERE a.id = $1`,
      [id]
    );
    const app = detail.rows[0];
    if (!app) {
      return res.status(404).json({ status: "error", message: "申請が見つかりません" });
    }
    if (app.status !== transition.from) {
      return res.status(409).json({
        status: "error",
        message: `現在のステータス（${app.status}）からは実行できません`,
      });
    }

    const isIssue = action === "issue";
    const result = await pool.query(
      `UPDATE applications
       SET status = $1,
           reject_reason = $2,
           issued_at = ${isIssue ? "now()" : "issued_at"},
           updated_at = now()
       WHERE id = $3
       RETURNING id, status, reject_reason, issued_at, updated_at`,
      [transition.to, action === "reject" ? reason : null, id]
    );

    if (action === "confirm_payment") {
      await notifyUser(
        app.student_id,
        `${app.document_type_name}の支払いが確認されました。発行までしばらくお待ちください。`,
        Number(id)
      );
    } else if (isIssue) {
      await notifyUser(app.student_id, `${app.document_type_name}の発行が完了しました。窓口でお受け取りください。`, Number(id));
    } else if (action === "complete") {
      await notifyUser(app.student_id, `${app.document_type_name}の受け渡しが完了しました。`, Number(id));
    } else if (action === "reject") {
      await notifyUser(
        app.student_id,
        `${app.document_type_name}の申請が却下されました。理由: ${reason}`,
        Number(id)
      );
    }

    res.json({ status: "ok", application: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "ステータスの更新に失敗しました" });
  }
});

// グループ単位でのステータス一括更新(職員のみ)
// 「続けて申請」でまとめて出された申請を、まとめて処理するためのエンドポイント
// 却下は理由が個別になるため対象外(個々の申請に対して行う)
const GROUP_ALLOWED_ACTIONS = ["confirm_payment", "issue", "complete"];

router.patch("/group/:groupId/status", requireAuth, requireRole("staff"), async (req: AuthRequest, res) => {
  const { groupId } = req.params;
  const { action } = req.body;

  if (!GROUP_ALLOWED_ACTIONS.includes(action)) {
    return res.status(400).json({ status: "error", message: "不正な操作です" });
  }
  const transition = ALLOWED_TRANSITIONS[action];

  try {
    const target = await pool.query(
      `SELECT a.id, a.student_id, dt.name AS document_type_name
       FROM applications a
       JOIN document_types dt ON dt.id = a.document_type_id
       WHERE a.group_id = $1 AND a.status = $2`,
      [groupId, transition.from]
    );

    if (target.rows.length === 0) {
      return res.status(409).json({ status: "error", message: "対象となる申請がありません（すでに処理済みの可能性があります）" });
    }

    const isIssue = action === "issue";
    const ids = target.rows.map((r) => r.id);
    await pool.query(
      `UPDATE applications
       SET status = $1, issued_at = ${isIssue ? "now()" : "issued_at"}, updated_at = now()
       WHERE id = ANY($2::int[])`,
      [transition.to, ids]
    );

    const studentId = target.rows[0].student_id;
    const names = [...new Set(target.rows.map((r) => r.document_type_name))].join("、");
    let message = "";
    if (action === "confirm_payment") {
      message = `${names}の支払いが確認されました。発行までしばらくお待ちください。`;
    } else if (isIssue) {
      message = `${names}の発行が完了しました。窓口でお受け取りください。`;
    } else {
      message = `${names}の受け渡しが完了しました。`;
    }
    await notifyUser(studentId, message, ids[0]);

    res.json({ status: "ok", updatedIds: ids });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "ステータスの一括更新に失敗しました" });
  }
});

export default router;
