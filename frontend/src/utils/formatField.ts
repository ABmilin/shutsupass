export interface RequiredField {
  key: string;
  label: string;
  type: string;
}

// month("2027-03")→"2027年3月"、date("2026-08-01")→"2026年8月1日" のように整形する
export function formatFieldValue(type: string, value: string): string {
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

// form_data(キーと値のオブジェクト)を、required_fieldsのラベル情報を使って表示用の配列に変換する
export function formatFormData(
  requiredFields: RequiredField[],
  formData: Record<string, string>
): { label: string; value: string }[] {
  return requiredFields
    .filter((f) => formData?.[f.key])
    .map((f) => ({ label: f.label, value: formatFieldValue(f.type, formData[f.key]) }));
}
