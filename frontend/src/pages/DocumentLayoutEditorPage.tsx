import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../api";
import PageLayout from "../components/PageLayout";
import { useAuth } from "../auth/AuthContext";

interface RequiredField {
  key: string;
  label: string;
  type: string;
}

interface LayoutPos {
  top: string; // 例: "80mm"
  left: string; // 例: "30mm"
}

interface DocumentType {
  id: number;
  name: string;
  required_fields: RequiredField[];
  layout: Record<string, LayoutPos>;
}

// A4サイズ(210mm×297mm)を、画面上のピクセルサイズに変換するための倍率
const MM_TO_PX = 2.6;
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;

function mmToPx(mm: number) {
  return mm * MM_TO_PX;
}
function pxToMm(px: number) {
  return Math.round((px / MM_TO_PX) * 10) / 10;
}

const FIXED_FIELDS: RequiredField[] = [
  { key: "student_id", label: "学籍番号", type: "text" },
  { key: "student_name", label: "氏名", type: "text" },
  { key: "issue_date", label: "発行日", type: "text" },
  { key: "application_id", label: "申請番号", type: "text" },
];

export default function DocumentLayoutEditorPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [layout, setLayout] = useState<Record<string, LayoutPos>>({});
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiRequest("/api/document-types")
      .then((data) => {
        const found = data.documentTypes.find((d: DocumentType) => String(d.id) === id);
        if (found) {
          setDocType(found);
          setLayout(found.layout || {});
        } else {
          setError("申請書の種類が見つかりません");
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "取得に失敗しました"))
      .finally(() => setLoading(false));
  }, [id]);

  const allFields = docType ? [...FIXED_FIELDS, ...docType.required_fields] : [];

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!armedKey) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    const leftMm = Math.max(0, Math.min(PAGE_WIDTH_MM - 10, pxToMm(xPx)));
    const topMm = Math.max(0, Math.min(PAGE_HEIGHT_MM - 10, pxToMm(yPx)));
    setLayout((prev) => ({ ...prev, [armedKey]: { top: `${topMm}mm`, left: `${leftMm}mm` } }));
    setArmedKey(null);
  }

  function handleRemove(key: string) {
    setLayout((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSave() {
    if (!docType) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/api/document-types/${docType.id}/layout`, {
        method: "PATCH",
        body: JSON.stringify({ layout }),
      });
      setMessage("レイアウトを保存しました");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageLayout headerRight={<span>{user?.displayName} さん</span>}>
        <p className="text-muted">読み込み中...</p>
      </PageLayout>
    );
  }

  if (!docType) {
    return (
      <PageLayout headerRight={<span>{user?.displayName} さん</span>}>
        <p className="error-text">{error || "申請書の種類が見つかりません"}</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout headerRight={<span>{user?.displayName} さん</span>}>
      <p><Link to="/staff/document-types">← 申請書の種類を管理に戻る</Link></p>
      <h1>{docType.name} のレイアウト編集</h1>
      <p className="text-muted">
        下の項目一覧から「配置する」を押し、右側の枠内のクリックしたい場所をクリックすると、その項目が配置されます。
        すでに配置済みの項目は、枠内の位置に表示されます（「削除」で配置解除できます）。
      </p>
      <p className="text-muted" style={{ fontSize: "0.85rem" }}>
        ※ これは帳票のレイアウトを確認・調整するための参考プレビューです。大学の公式な証明書としての効力を持つものではありません。
      </p>

      {error && <p className="error-text">{error}</p>}
      {message && <p style={{ color: "var(--status-completed)", fontWeight: 700 }}>{message}</p>}

      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "0 0 220px" }}>
          <h2 style={{ marginTop: 0 }}>配置する項目</h2>
          {allFields.map((f) => {
            const placed = layout[f.key];
            return (
              <div key={f.key} className="card" style={{ padding: "0.6rem 0.8rem", marginBottom: "0.5rem" }}>
                <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{f.label}</div>
                <div className="text-muted" style={{ fontSize: "0.78rem", marginBottom: "0.4rem" }}>
                  {placed ? `配置済み（上${placed.top}・左${placed.left}）` : "未配置"}
                </div>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button
                    type="button"
                    onClick={() => setArmedKey(f.key)}
                    className={`btn btn-sm ${armedKey === f.key ? "btn-accent" : "btn-outline"}`}
                  >
                    {armedKey === f.key ? "枠内をクリック..." : "配置する"}
                  </button>
                  {placed && (
                    <button type="button" onClick={() => handleRemove(f.key)} className="btn btn-danger-text btn-sm">
                      削除
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-block" style={{ marginTop: "1rem" }}>
            {saving ? "保存中..." : "レイアウトを保存"}
          </button>
        </div>

        <div>
          <div
            onClick={handleCanvasClick}
            style={{
              position: "relative",
              width: mmToPx(PAGE_WIDTH_MM),
              height: mmToPx(PAGE_HEIGHT_MM),
              background: "#fff",
              border: "2px solid var(--color-primary)",
              borderRadius: "4px",
              cursor: armedKey ? "crosshair" : "default",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div style={{ position: "absolute", top: mmToPx(10), left: 0, right: 0, textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.75rem" }}>
              {docType.name}（プレビュー枠 A4）
            </div>
            {allFields.map((f) => {
              const pos = layout[f.key];
              if (!pos) return null;
              return (
                <div
                  key={f.key}
                  style={{
                    position: "absolute",
                    top: pos.top,
                    left: pos.left,
                    background: "var(--color-primary-soft)",
                    border: "1px solid var(--color-primary)",
                    borderRadius: "3px",
                    padding: "2px 6px",
                    fontSize: "0.7rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
