import { useEffect, useState } from "react";
import { apiRequest } from "../api";

interface Comment {
  id: number;
  sender_role: "student" | "staff";
  sender_name: string;
  message: string;
  created_at: string;
}

type Lang = "en" | "zh" | "ja";
const LANG_LABEL: Record<Lang, string> = { en: "English", zh: "中文", ja: "日本語" };

export default function ApplicationComments({ applicationId }: { applicationId: number }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [translations, setTranslations] = useState<Record<number, { lang: Lang; text: string; note?: string }>>({});
  const [translating, setTranslating] = useState<number | null>(null);

  async function load() {
    try {
      const data = await apiRequest(`/api/applications/${applicationId}/comments`);
      setComments(data.comments);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    }
  }

  useEffect(() => {
    if (open && !loaded) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleTranslate(commentId: number, message: string, lang: Lang) {
    setTranslating(commentId);
    try {
      const data = await apiRequest("/api/translate", {
        method: "POST",
        body: JSON.stringify({ text: message, target: lang }),
      });
      setTranslations((prev) => ({ ...prev, [commentId]: { lang, text: data.translatedText, note: data.note } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "参考訳の取得に失敗しました");
    } finally {
      setTranslating(null);
    }
  }

  async function handleSend() {
    if (!text.trim()) return;
    setSending(true);
    setError("");
    try {
      await apiRequest(`/api/applications/${applicationId}/comments`, {
        method: "POST",
        body: JSON.stringify({ message: text.trim() }),
      });
      setText("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <button onClick={() => setOpen((v) => !v)} className="btn btn-outline btn-sm">
        {open ? "やり取りを閉じる" : `やり取り${comments.length > 0 ? `（${comments.length}）` : ""}`}
      </button>

      {open && (
        <div style={{ marginTop: "0.75rem", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.75rem" }}>
          {error && <p className="error-text">{error}</p>}

          {comments.length === 0 && <p className="text-muted" style={{ margin: 0 }}>まだメッセージはありません。</p>}

          {comments.map((c) => {
            const translation = translations[c.id];
            return (
              <div key={c.id} style={{ marginBottom: "0.6rem" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  <strong style={{ color: "var(--color-text)" }}>{c.sender_name}</strong>
                  {" "}（{c.sender_role === "staff" ? "職員" : "学生"}） ・ {new Date(c.created_at).toLocaleString("ja-JP")}
                </div>
                <p style={{ margin: "0.2rem 0 0" }}>{c.message}</p>

                <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}>
                  {(["en", "zh", "ja"] as Lang[]).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => handleTranslate(c.id, c.message, lang)}
                      disabled={translating === c.id}
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                    >
                      {LANG_LABEL[lang]}に参考訳
                    </button>
                  ))}
                </div>

                {translation && (
                  <div style={{ marginTop: "0.3rem", padding: "0.4rem 0.6rem", background: "var(--color-bg)", borderRadius: "var(--radius-sm)" }}>
                    <p style={{ margin: 0, fontSize: "0.9rem" }}>{translation.text}</p>
                    <p className="text-muted" style={{ margin: "0.2rem 0 0", fontSize: "0.7rem" }}>
                      {translation.note || `${LANG_LABEL[translation.lang]}への参考訳（AIによる自動翻訳、公式な翻訳ではありません）`}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <input
              type="text"
              className="input"
              placeholder="メッセージを入力"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button onClick={handleSend} disabled={sending || !text.trim()} className="btn btn-primary btn-sm">
              送信
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
