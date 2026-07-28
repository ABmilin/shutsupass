import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { translateText, SupportedLang } from "../translation/translate";

export interface RequiredField {
  key: string;
  label: string;
  type: string;
}

export interface ApplicationPdfData {
  id: number;
  student_id: number;
  copies: number;
  form_data: Record<string, string>;
  receive_method: "download" | "window";
  purpose: "job_hunting" | "other";
  purpose_detail: string | null;
  needs_sealing: boolean;
  seal_group_label: string | null;
  total_fee: number;
  status: string;
  reject_reason: string | null;
  created_at: string | Date;
  issued_at: string | Date | null;
  document_type_name: string;
  required_fields: RequiredField[];
  student_login_id: string;
  student_name: string;
}

export type ApplicationPdfKind = "student_receipt" | "staff_work_sheet";

const STATUS_LABELS: Record<string, string> = {
  submitted: "申請中（支払い待ち）",
  payment_confirmed: "支払い確認済み（発行準備中）",
  issued: "発行済み（受け取り可能）",
  completed: "受け取り完了",
  rejected: "却下（差し戻し）",
};

const PURPOSE_LABELS: Record<string, string> = {
  job_hunting: "就職活動",
  other: "その他",
};

export type PdfLang = "ja" | SupportedLang;

// 画面固定文言は、翻訳エンジンを介さず事前に用意した対訳を使う(構造部分は精度・速度を優先)。
// 学部名・使用目的の自由記述など、利用者が入力した自由記述部分のみAIによる参考訳を用いる。
const UI_TEXT: Record<PdfLang, Record<string, string>> = {
  ja: {
    receiptTitle: "ShutsuPass 申請控え",
    workSheetTitle: "ShutsuPass 職員作業票",
    receiptSubtitle: "このPDFは申請内容の控えです。公式な証明書ではありません。",
    workSheetSubtitle: "このPDFは窓口処理の確認用です。公式な証明書ではありません。",
    sectionApplication: "申請情報",
    sectionStudent: "学生情報",
    sectionInput: "入力内容",
    sectionReject: "却下理由",
    sectionGuide: "窓口での案内",
    sectionStaffCheck: "職員確認欄",
    labelId: "申請番号",
    labelCreatedAt: "申請日時",
    labelStatus: "現在のステータス",
    labelDocType: "申請書の種類",
    labelCopies: "部数",
    labelFee: "手数料",
    labelReceiveMethod: "受け取り方法",
    labelPurpose: "使用目的",
    labelSealing: "厳封希望",
    labelIssuedAt: "発行日",
    labelStudentId: "学籍番号",
    labelStudentName: "氏名",
    noExtraFields: "追加の入力項目はありません。",
    guidePaymentLabel: "支払い",
    guidePaymentValue: "表示された手数料を事務局窓口でお支払いください。",
    guideReceiveLabel: "受け取り",
    guideReceiveValue: "発行完了後、窓口で証明書をお受け取りください。",
    guideNoteLabel: "注意",
    guideNoteValue: "このPDFは申請内容の控えであり、証明書としては使用できません。",
    checkIdentity: "本人確認を行った",
    checkFee: "手数料を確認した",
    checkContent: "申請内容と発行対象を確認した",
    checkSealing: "厳封希望の有無を確認した",
    staffLabel: "担当者",
    processedLabel: "処理日",
    noteLabel: "備考",
    window: "窓口受取",
    download: "ダウンロード",
    yes: "あり",
    no: "なし",
    translationNote: "※ 学部・学科等の自由記述部分は、AI（LibreTranslate）による参考訳です。正式な翻訳文書ではありません。",
  },
  en: {
    receiptTitle: "ShutsuPass Application Receipt",
    workSheetTitle: "ShutsuPass Staff Worksheet",
    receiptSubtitle: "This PDF is a copy of your application. It is not an official certificate.",
    workSheetSubtitle: "This PDF is for front-desk processing checks. It is not an official certificate.",
    sectionApplication: "Application Details",
    sectionStudent: "Student Information",
    sectionInput: "Entered Information",
    sectionReject: "Reason for Rejection",
    sectionGuide: "Guidance at the Counter",
    sectionStaffCheck: "Staff Confirmation",
    labelId: "Application No.",
    labelCreatedAt: "Applied At",
    labelStatus: "Current Status",
    labelDocType: "Document Type",
    labelCopies: "Copies",
    labelFee: "Fee",
    labelReceiveMethod: "Receiving Method",
    labelPurpose: "Purpose",
    labelSealing: "Sealed Envelope Requested",
    labelIssuedAt: "Issued Date",
    labelStudentId: "Student ID",
    labelStudentName: "Name",
    noExtraFields: "No additional fields.",
    guidePaymentLabel: "Payment",
    guidePaymentValue: "Please pay the fee shown above at the administration counter.",
    guideReceiveLabel: "Pickup",
    guideReceiveValue: "Please pick up the document at the counter after it has been issued.",
    guideNoteLabel: "Note",
    guideNoteValue: "This PDF is a copy of the application and cannot be used as a certificate.",
    checkIdentity: "Identity verified",
    checkFee: "Fee confirmed",
    checkContent: "Application content and recipient confirmed",
    checkSealing: "Sealing request confirmed",
    staffLabel: "Handled by",
    processedLabel: "Processed on",
    noteLabel: "Notes",
    window: "Pickup at counter",
    download: "Download",
    yes: "Yes",
    no: "No",
    translationNote: "* Free-text fields (e.g. department) are AI-translated reference text (LibreTranslate), not an official translation.",
  },
  zh: {
    receiptTitle: "ShutsuPass 申请存根",
    workSheetTitle: "ShutsuPass 职员工作单",
    receiptSubtitle: "此PDF为申请内容的存根，并非正式证明文件。",
    workSheetSubtitle: "此PDF用于窗口处理确认，并非正式证明文件。",
    sectionApplication: "申请信息",
    sectionStudent: "学生信息",
    sectionInput: "填写内容",
    sectionReject: "驳回理由",
    sectionGuide: "窗口须知",
    sectionStaffCheck: "职员确认栏",
    labelId: "申请编号",
    labelCreatedAt: "申请时间",
    labelStatus: "当前状态",
    labelDocType: "申请类型",
    labelCopies: "份数",
    labelFee: "手续费",
    labelReceiveMethod: "领取方式",
    labelPurpose: "使用目的",
    labelSealing: "是否需要密封",
    labelIssuedAt: "发放日期",
    labelStudentId: "学号",
    labelStudentName: "姓名",
    noExtraFields: "没有其他输入项目。",
    guidePaymentLabel: "付款",
    guidePaymentValue: "请在事务局窗口支付上述金额。",
    guideReceiveLabel: "领取",
    guideReceiveValue: "发放完成后，请在窗口领取证明文件。",
    guideNoteLabel: "注意",
    guideNoteValue: "此PDF仅为申请存根，不能作为证明文件使用。",
    checkIdentity: "已确认本人身份",
    checkFee: "已确认手续费",
    checkContent: "已确认申请内容及发放对象",
    checkSealing: "已确认是否需要密封",
    staffLabel: "负责人",
    processedLabel: "处理日期",
    noteLabel: "备注",
    window: "窗口领取",
    download: "下载",
    yes: "需要",
    no: "不需要",
    translationNote: "※ 学部・学科等自由填写内容为AI（LibreTranslate）参考翻译，非正式译文。",
  },
};

const FONT_CANDIDATES = [
  process.env.PDF_FONT_PATH,
  path.join(process.cwd(), "node_modules", "noto-fontface-cjk-jp", "fonts", "Noto", "NotoSansCJKjp-Regular.otf"),
].filter(Boolean) as string[];

function findFontPath(): string {
  const found = FONT_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("PDF生成に必要な日本語フォントが見つかりません");
  }
  return found;
}

function formatDateTime(value: string | Date | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function formatDate(value: string | Date | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function formatFieldValue(type: string, value: string): string {
  if (!value) return "";
  if (type === "month") {
    const [year, month] = value.split("-");
    if (year && month) return `${year}年${Number(month)}月`;
  }
  if (type === "date") {
    const [year, month, day] = value.split("-");
    if (year && month && day) return `${year}年${Number(month)}月${Number(day)}日`;
  }
  return value;
}

function drawTitle(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
  doc.fontSize(20).fillColor("#102a43").text(title, { align: "center" });
  doc.moveDown(0.25);
  doc.fontSize(10).fillColor("#52606d").text(subtitle, { align: "center" });
  doc.moveDown(1.2);
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.6);
  doc.fontSize(12).fillColor("#102a43").text(title);
  doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).strokeColor("#bcccdc").lineWidth(1).stroke();
  doc.moveDown(0.7);
}

function drawRows(doc: PDFKit.PDFDocument, rows: Array<[string, string]>) {
  const labelWidth = 130;
  const valueWidth = 350;
  for (const [label, value] of rows) {
    const y = doc.y;
    doc.fontSize(9).fillColor("#627d98").text(label, 55, y, { width: labelWidth });
    doc.fontSize(10).fillColor("#243b53").text(value || "-", 55 + labelWidth, y, { width: valueWidth });
    doc.moveDown(0.65);
  }
}

function drawCheckBox(doc: PDFKit.PDFDocument, label: string) {
  const y = doc.y;
  doc.rect(55, y + 1, 10, 10).strokeColor("#829ab1").stroke();
  doc.fontSize(10).fillColor("#243b53").text(label, 72, y, { width: 450 });
  doc.moveDown(0.8);
}

export async function renderApplicationPdf(
  data: ApplicationPdfData,
  kind: ApplicationPdfKind,
  lang: PdfLang = "ja"
): Promise<Buffer> {
  const t = UI_TEXT[lang] ?? UI_TEXT.ja;

  // 自由記述部分(学部・学科などの入力値、その他理由、却下理由)のみAIで参考訳する。
  // 構造・固定文言(見出しやラベル)は上の辞書を使い、翻訳エンジンの状態に左右されない。
  async function tr(text: string): Promise<string> {
    if (lang === "ja" || !text) return text;
    const result = await translateText(text, lang);
    return result.translatedText;
  }

  const translatedDocTypeName = await tr(data.document_type_name);
  const translatedPurposeDetail = data.purpose_detail ? await tr(data.purpose_detail) : "";
  const translatedRejectReason = data.reject_reason ? await tr(data.reject_reason) : "";
  const translatedFieldValues = await Promise.all(
    data.required_fields.map(async (field) => ({
      label: lang === "ja" ? field.label : await tr(field.label),
      value: await tr(formatFieldValue(field.type, data.form_data?.[field.key] ?? "")),
    }))
  );

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const fontPath = findFontPath();
  doc.registerFont("jp", fontPath);
  doc.font("jp");

  doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

  const title = kind === "student_receipt" ? t.receiptTitle : t.workSheetTitle;
  const subtitle = kind === "student_receipt" ? t.receiptSubtitle : t.workSheetSubtitle;

  drawTitle(doc, title, subtitle);
  if (lang !== "ja") {
    doc.fontSize(8).fillColor("#9aa5b1").text(t.translationNote, { align: "center", width: 495 });
    doc.moveDown(0.8);
  }

  drawSectionTitle(doc, t.sectionApplication);
  drawRows(doc, [
    [t.labelId, `#${data.id}`],
    [t.labelCreatedAt, formatDateTime(data.created_at)],
    [t.labelStatus, STATUS_LABELS[data.status] ?? data.status],
    [t.labelDocType, translatedDocTypeName],
    [t.labelCopies, `${data.copies}`],
    [t.labelFee, `${data.total_fee}`],
    [t.labelReceiveMethod, data.receive_method === "window" ? t.window : t.download],
    [
      t.labelPurpose,
      data.purpose === "other" && translatedPurposeDetail
        ? `${PURPOSE_LABELS[data.purpose] ?? data.purpose}（${translatedPurposeDetail}）`
        : PURPOSE_LABELS[data.purpose] ?? data.purpose,
    ],
    [t.labelSealing, `${data.needs_sealing ? t.yes : t.no}${data.seal_group_label ? `（${data.seal_group_label}）` : ""}`],
    [t.labelIssuedAt, formatDate(data.issued_at) || "-"],
  ]);

  drawSectionTitle(doc, t.sectionStudent);
  drawRows(doc, [
    [t.labelStudentId, data.student_login_id],
    [t.labelStudentName, data.student_name],
  ]);

  drawSectionTitle(doc, t.sectionInput);
  if (translatedFieldValues.length === 0) {
    doc.fontSize(10).fillColor("#627d98").text(t.noExtraFields);
  } else {
    drawRows(doc, translatedFieldValues.map((f) => [f.label, f.value] as [string, string]));
  }

  if (data.status === "rejected" && translatedRejectReason) {
    drawSectionTitle(doc, t.sectionReject);
    doc.fontSize(10).fillColor("#9b1c1c").text(translatedRejectReason, { width: 480 });
  }

  if (kind === "student_receipt") {
    drawSectionTitle(doc, t.sectionGuide);
    drawRows(doc, [
      [t.guidePaymentLabel, t.guidePaymentValue],
      [t.guideReceiveLabel, t.guideReceiveValue],
      [t.guideNoteLabel, t.guideNoteValue],
    ]);
  } else {
    drawSectionTitle(doc, t.sectionStaffCheck);
    drawCheckBox(doc, t.checkIdentity);
    drawCheckBox(doc, t.checkFee);
    drawCheckBox(doc, t.checkContent);
    drawCheckBox(doc, t.checkSealing);
    doc.moveDown(0.6);
    drawRows(doc, [
      [t.staffLabel, ""],
      [t.processedLabel, ""],
      [t.noteLabel, ""],
    ]);
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor("#829ab1").text(
      `Generated by ShutsuPass / ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} / page ${i + 1}`,
      50,
      805,
      { width: 495, align: "center" }
    );
  }

  doc.end();
  return done;
}
