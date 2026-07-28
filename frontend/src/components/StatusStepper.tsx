const STAGES = [
  { key: "submitted", label: "申請" },
  { key: "payment_confirmed", label: "支払い" },
  { key: "issued", label: "発行" },
  { key: "completed", label: "受取" },
];

export default function StatusStepper({ status }: { status: string }) {
  if (status === "rejected") {
    return <span className="badge badge-rejected">却下（差し戻し）</span>;
  }

  const currentIndex = STAGES.findIndex((s) => s.key === status);

  return (
    <div className="stepper">
      {STAGES.map((stage, i) => (
        <div key={stage.key} className={`stepper-step ${i <= currentIndex ? "is-active" : ""} ${i === currentIndex ? "is-current" : ""}`}>
          <div className="stepper-dot-wrap">
            <div className="stepper-dot" />
            <span className="stepper-label">{stage.label}</span>
          </div>
          {i < STAGES.length - 1 && (
            <div className={`stepper-line ${i < currentIndex ? "is-active" : ""}`} />
          )}
        </div>
      ))}
    </div>
  );
}
