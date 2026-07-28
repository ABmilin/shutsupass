import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiRequest } from "../api";

interface RequiredField {
  key: string;
  label: string;
  type: string;
}

interface LayoutPos {
  top: string;
  left: string;
}

interface DocumentType {
  id: number;
  name: string;
  required_fields: RequiredField[];
  layout: Record<string, LayoutPos>;
}

interface ApplicationData {
  id: number;
  document_type_name: string;
  form_data: Record<string, string>;
  student_login_id?: string;
  student_name?: string;
}

function formatValue(type: string, value: string): string {
  if (!value) return "";
  if (type === "month") {
    const [y, m] = value.split("-");
    if (y && m) return `${y}年${Number(m)}月`;
  }
  if (type === "date") {
    const [y, m, d] = value.split("-");
    if (y && m && d) return `${y}年${Number(m)}月${Number(d)}日`;
  }
  return value;
}

export default function DocumentPrintPreviewPage() {
  const { id } = useParams();
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [appsMine, appsStaff, typesData] = await Promise.all([
          apiRequest("/api/applications/mine").catch(() => null),
          apiRequest("/api/applications").catch(() => null),
          apiRequest("/api/document-types"),
        ]);
        const list = [...(appsMine?.applications ?? []), ...(appsStaff?.applications ?? [])];
        const app = list.find((a: ApplicationData) => String(a.id) === id);
        if (!app) {
          setError("申請データが見つかりません");
          return;
        }
        const dt = typesData.documentTypes.find((d: DocumentType) => d.name === app.document_type_name);
        setApplication(app);
        setDocType(dt ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "取得に失敗しました");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <p style={{ padding: "2rem" }}>読み込み中...</p>;
  if (error || !docType || !application) {
    return (
      <div style={{ padding: "2rem" }}>
        <p>{error || "表示できるデータがありません"}</p>
        <Link to="/staff">ダッシュボードに戻る</Link>
      </div>
    );
  }

  const values: Record<string, string> = {
    student_id: application.student_login_id ?? "",
    student_name: application.student_name ?? "",
    issue_date: new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" }),
    application_id: String(application.id),
    ...application.form_data,
  };

  return (
    <div>
      <div className="no-print" style={{ padding: "1rem", background: "#f4f5f7", display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <Link to="/staff">← 戻る</Link>
        <button onClick={() => window.print()} style={{ padding: "0.5rem 1rem", fontWeight: 700 }}>
          印刷する（PDFとして保存も可能）
        </button>
        <span style={{ fontSize: "0.85rem", color: "#666" }}>
          ブラウザの印刷ダイアログで「PDFとして保存」を選ぶと、PDFファイルになります。
        </span>
      </div>

      <div
        style={{
          position: "relative",
          width: "210mm",
          height: "297mm",
          margin: "1rem auto",
          background: "#fff",
          border: "1px solid #ccc",
          fontFamily: "'Noto Serif JP', serif",
        }}
      >
        <div style={{ position: "absolute", top: "12mm", left: "12mm", right: "12mm", bottom: "12mm", border: "1px solid #333" }} />
        <div style={{ position: "absolute", top: "22mm", left: 0, right: 0, textAlign: "center", fontSize: "20pt", fontWeight: 700, letterSpacing: "0.3em" }}>
          {docType.name}
        </div>

        {docType.required_fields.map((f) => {
          const pos = docType.layout[f.key];
          if (!pos) return null;
          return (
            <div key={f.key} style={{ position: "absolute", top: pos.top, left: pos.left }}>
              <div style={{ fontSize: "8pt", color: "#666" }}>{f.label}</div>
              <div style={{ fontSize: "12pt" }}>{formatValue(f.type, values[f.key])}</div>
            </div>
          );
        })}

        {["student_id", "student_name", "issue_date", "application_id"].map((key) => {
          const pos = docType.layout[key];
          if (!pos) return null;
          const labels: Record<string, string> = {
            student_id: "学籍番号",
            student_name: "氏名",
            issue_date: "発行日",
            application_id: "申請番号",
          };
          return (
            <div key={key} style={{ position: "absolute", top: pos.top, left: pos.left }}>
              <div style={{ fontSize: "8pt", color: "#666" }}>{labels[key]}</div>
              <div style={{ fontSize: "12pt" }}>{values[key]}</div>
            </div>
          );
        })}

        <div style={{ position: "absolute", bottom: "14mm", left: 0, right: 0, textAlign: "center", fontSize: "7pt", color: "#999" }}>
          ※本画面はシステムによる自動生成の参考表示であり、大学の公式な証明書ではありません。
        </div>
      </div>

      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          .no-print { display: none; }
          body { margin: 0; }
        }
      `}</style>
    </div>
  );
}
