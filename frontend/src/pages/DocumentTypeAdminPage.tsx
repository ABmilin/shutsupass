import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import PageLayout from "../components/PageLayout";
import { useAuth } from "../auth/AuthContext";

interface RequiredField {
  key: string;
  label: string;
  type: "text" | "month" | "date";
}

interface DocumentType {
  id: number;
  code: string;
  name: string;
  fee: number;
  required_fields: RequiredField[];
}

const FIELD_TYPE_LABEL: Record<string, string> = {
  text: "テキスト",
  month: "年月（カレンダー）",
  date: "日付（カレンダー）",
};

function generateKey(): string {
  return `field_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

function generateCode(): string {
  return `doctype_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

function emptyField(): RequiredField {
  return { key: generateKey(), label: "", type: "text" };
}

export default function DocumentTypeAdminPage() {
  const { user } = useAuth();
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [fee, setFee] = useState(0);
  const [fields, setFields] = useState<RequiredField[]>([emptyField()]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest("/api/document-types");
      setDocumentTypes(data.documentTypes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startNew() {
    setEditingId("new");
    setCode(generateCode());
    setName("");
    setFee(0);
    setFields([emptyField()]);
    setError("");
  }

  function startEdit(dt: DocumentType) {
    setEditingId(dt.id);
    setCode(dt.code);
    setName(dt.name);
    setFee(dt.fee);
    setFields(dt.required_fields.length > 0 ? dt.required_fields.map((f) => ({ ...f })) : [emptyField()]);
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setError("");
  }

  function updateField(index: number, patch: Partial<RequiredField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function addField() {
    setFields((prev) => [...prev, emptyField()]);
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError("");

    const cleanedFields = fields.filter((f) => f.label.trim()).map((f) => ({
      ...f,
      key: f.key.trim() || generateKey(),
    }));

    if (!name.trim()) {
      setError("申請書の名称を入力してください");
      return;
    }

    setSaving(true);
    try {
      if (editingId === "new") {
        await apiRequest("/api/document-types", {
          method: "POST",
          body: JSON.stringify({ code, name, fee, requiredFields: cleanedFields }),
        });
      } else {
        await apiRequest(`/api/document-types/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ name, fee, requiredFields: cleanedFields }),
        });
      }
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const isEditing = editingId !== null;

  return (
    <PageLayout headerRight={<span>{user?.displayName} さん</span>}>
      <p><Link to="/staff">← ダッシュボードに戻る</Link></p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>申請書の種類を管理</h1>
        {!isEditing && (
          <button onClick={startNew} className="btn btn-accent">＋ 新しい申請書を追加</button>
        )}
      </div>
      <p className="text-muted">
        ここで設定した申請書は、学生の「新規申請」画面にそのまま反映されます。
      </p>

      {error && <p className="error-text">{error}</p>}

      {isEditing && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{editingId === "new" ? "新しい申請書を追加" : "申請書を編集"}</h2>

          <div className="field">
            <label className="label">申請書の名称</label>
            <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 駐輪場駐輪許可願" />
          </div>

          <div className="field">
            <label className="label">手数料（円）</label>
            <input type="number" min={0} className="input" value={fee} onChange={(e) => setFee(Number(e.target.value))} />
          </div>

          <div className="field">
            <label className="label">入力項目</label>
            {fields.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
                <input
                  type="text"
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="項目名（例: 学部・学科）"
                  value={f.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                />
                <select
                  className="input"
                  style={{ width: 180 }}
                  value={f.type}
                  onChange={(e) => updateField(i, { type: e.target.value as RequiredField["type"] })}
                >
                  {Object.entries(FIELD_TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button type="button" onClick={() => removeField(i)} className="btn btn-danger-text btn-sm">削除</button>
              </div>
            ))}
            <button type="button" onClick={addField} className="btn btn-outline btn-sm">＋ 項目を追加</button>
          </div>

          <div className="actions-row">
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? "保存中..." : "保存する"}
            </button>
            <button onClick={cancelEdit} className="btn btn-outline">キャンセル</button>
          </div>
        </div>
      )}

      {!isEditing && loading && <p className="text-muted">読み込み中...</p>}

      {!isEditing && documentTypes.map((dt) => (
        <div key={dt.id} className="card">
          <strong style={{ fontSize: "1.05rem" }}>{dt.name}</strong>
          <p style={{ margin: "0.25rem 0" }}>手数料: {dt.fee}円</p>
          <p className="text-muted" style={{ marginBottom: "0.5rem" }}>
            入力項目: {dt.required_fields.length > 0 ? dt.required_fields.map((f) => f.label).join("、") : "なし"}
          </p>
          <div className="actions-row">
            <button onClick={() => startEdit(dt)} className="btn btn-outline btn-sm">編集する</button>
          </div>
        </div>
      ))}
    </PageLayout>
  );
}
