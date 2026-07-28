import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { apiRequest } from "../api";

interface Notification {
  id: number;
  application_id: number | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

const POLL_INTERVAL_MS = 30000;
type NotifLang = "ja" | "en" | "zh";
const NOTIF_LANG_LABEL: Record<NotifLang, string> = { ja: "日本語", en: "English", zh: "中文" };

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [lang, setLang] = useState<NotifLang>("ja");
  const [translated, setTranslated] = useState<Record<number, string>>({});
  const [translating, setTranslating] = useState(false);

  async function load() {
    try {
      const data = await apiRequest("/api/notifications");
      setNotifications(data.notifications);
    } catch {
      // 通知の取得失敗は画面全体をブロックしない
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function markRead(id: number) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      // ignore
    }
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await apiRequest("/api/notifications/read-all", { method: "PATCH" });
    } catch {
      // ignore
    }
  }

  async function handleLangChange(next: NotifLang) {
    setLang(next);
    if (next === "ja") return;
    setTranslating(true);
    try {
      const results = await Promise.all(
        notifications.map(async (n) => {
          if (translated[n.id]) return null; // すでに参考訳済みならスキップ(簡易キャッシュ)
          const data = await apiRequest("/api/translate", {
            method: "POST",
            body: JSON.stringify({ text: n.message, target: next }),
          });
          return { id: n.id, text: data.translatedText };
        })
      );
      setTranslated((prev) => {
        const updated = { ...prev };
        for (const r of results) {
          if (r) updated[r.id] = r.text;
        }
        return updated;
      });
    } catch {
      // 参考訳に失敗しても日本語表示に留める
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button className="notif-bell" onClick={() => setOpen((v) => !v)} aria-label="通知">
        <Bell size={19} strokeWidth={2} />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <strong>通知</strong>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="notif-mark-all">すべて既読にする</button>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.3rem", padding: "0.4rem 0.75rem", borderBottom: "1px solid var(--color-border)" }}>
            {(["ja", "en", "zh"] as NotifLang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => handleLangChange(l)}
                disabled={translating}
                className={`btn btn-sm ${lang === l ? "btn-primary" : "btn-outline"}`}
                style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem" }}
              >
                {NOTIF_LANG_LABEL[l]}
              </button>
            ))}
            {translating && <span className="text-muted" style={{ fontSize: "0.7rem", alignSelf: "center" }}>参考訳を取得中...</span>}
          </div>

          {notifications.length === 0 && <p className="notif-empty">通知はありません</p>}

          {notifications.map((n) => (
            <div
              key={n.id}
              className={`notif-item ${n.is_read ? "" : "is-unread"}`}
              onClick={() => !n.is_read && markRead(n.id)}
            >
              <p className="notif-message">{lang !== "ja" && translated[n.id] ? translated[n.id] : n.message}</p>
              {lang !== "ja" && (
                <p className="text-muted" style={{ fontSize: "0.65rem", margin: "0.1rem 0 0" }}>
                  {translated[n.id] ? "AIによる参考訳" : "日本語の原文を表示しています"}
                </p>
              )}
              <span className="notif-time">{new Date(n.created_at).toLocaleString("ja-JP")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
