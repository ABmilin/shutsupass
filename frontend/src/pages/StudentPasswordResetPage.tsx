import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import PageLayout from "../components/PageLayout";
import { useAuth } from "../auth/AuthContext";

interface Student {
  id: number;
  login_id: string;
  display_name: string;
}

export default function StudentPasswordResetPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resetResult, setResetResult] = useState<{ studentName: string; tempPassword: string } | null>(null);

  async function loadStudents(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiRequest(`/api/users/students?search=${encodeURIComponent(search)}`);
      setStudents(data.students);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReset(student: Student) {
    if (!window.confirm(`${student.display_name}さん（${student.login_id}）のパスワードをリセットしますか?\n窓口で本人確認ができていることを確認してください。`)) {
      return;
    }
    setError("");
    try {
      const data = await apiRequest(`/api/users/${student.id}/reset-password`, { method: "POST" });
      setResetResult({ studentName: `${student.display_name}（${student.login_id}）`, tempPassword: data.tempPassword });
    } catch (err) {
      setError(err instanceof Error ? err.message : "リセットに失敗しました");
    }
  }

  return (
    <PageLayout
      headerRight={
        <>
          <span>{user?.displayName} さん</span>
        </>
      }
    >
      <p><Link to="/staff">← ダッシュボードに戻る</Link></p>
      <h1>学生のパスワードをリセット</h1>
      <p className="text-muted">
        窓口で本人確認（学生証の提示など）を行った上でリセットしてください。
      </p>

      {resetResult && (
        <div className="card" style={{ borderColor: "var(--color-accent)", background: "var(--color-accent-soft)" }}>
          <strong>{resetResult.studentName} の一時パスワード</strong>
          <p className="mono" style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0.5rem 0" }}>
            {resetResult.tempPassword}
          </p>
          <p className="text-muted" style={{ marginBottom: 0 }}>
            この画面を閉じると再表示できません。学生に口頭でお伝えください。
            ログイン後、ダッシュボードの「パスワード変更」からご自身のパスワードに変更できます。
          </p>
        </div>
      )}

      <form onSubmit={loadStudents} className="search-row">
        <input
          type="text"
          className="input"
          placeholder="学籍番号または氏名で検索（空欄で全員表示）"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">検索</button>
      </form>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="text-muted">読み込み中...</p>}
      {!loading && students.length === 0 && <div className="empty-state">該当する学生がいません。</div>}

      {students.map((s) => (
        <div key={s.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong>{s.display_name}</strong>
            <span className="mono text-muted" style={{ marginLeft: "0.5rem" }}>{s.login_id}</span>
          </div>
          <button onClick={() => handleReset(s)} className="btn btn-accent btn-sm">
            パスワードをリセット
          </button>
        </div>
      ))}
    </PageLayout>
  );
}
