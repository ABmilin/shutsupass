// LibreTranslate(自前でDocker上に立てた翻訳エンジン)を呼び出すヘルパー。
// 外部の商用翻訳サービス(Google/DeepL等)には一切依存しない。
// 通知・メッセージ・申請控えPDFの「参考訳」表示にのみ利用し、
// 証明書の申請・承認・発行といった中核業務ロジックはこの機能に依存しない。
//
// TRANSLATION_PROVIDER=ollama を指定すると、まずOllama(LLM)での翻訳を試み、
// 失敗・タイムアウトした場合はLibreTranslateへ自動的にフォールバックする。
// 既定(未指定)ではLibreTranslateのみを使用し、Ollamaは一切呼ばれない。

const TRANSLATE_URL = process.env.TRANSLATE_URL || "http://libretranslate:5000/translate";
const TRANSLATION_PROVIDER = process.env.TRANSLATION_PROVIDER || "libretranslate";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://ollama:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma2:2b";
const OLLAMA_TIMEOUT_MS = 12000;

export type SupportedLang = "en" | "zh" | "ja";
type LibreTranslateLang = "auto" | "en" | "ja" | "zh-Hans";

interface TranslateResult {
  translatedText: string;
  note?: string;
}

const COMMON_TRANSLATIONS: Record<string, Partial<Record<SupportedLang, string>>> = {
  "こんにちは": { en: "Hello", zh: "你好" },
  "ありがとう": { en: "Thank you", zh: "谢谢" },
  "ありがとうございます": { en: "Thank you", zh: "谢谢" },
  "さようなら": { en: "Goodbye", zh: "再见" },
  "おはよう": { en: "Good morning", zh: "早上好" },
  "おはようございます": { en: "Good morning", zh: "早上好" },
  "こんばんは": { en: "Good evening", zh: "晚上好" },
  "すみません": { en: "Sorry", zh: "对不起" },
  "確認しました": { en: "Confirmed", zh: "已确认" },
};

const LANG_NAME: Record<SupportedLang, string> = { en: "English", zh: "Simplified Chinese", ja: "Japanese" };

function toLibreTarget(target: SupportedLang): LibreTranslateLang {
  if (target === "zh") return "zh-Hans";
  return target;
}

function detectLikelyLang(text: string): "en" | "ja" | "zh-Hans" | null {
  const trimmed = text.trim();
  if (/[\u3040-\u30ff]/.test(trimmed)) return "ja";
  if (/^[\x00-\x7F]+$/.test(trimmed) && /[A-Za-z]/.test(trimmed)) return "en";
  return null;
}

// LibreTranslate(Argos Translate)経由の翻訳。軽量だが、主語省略の多い日本語は苦手な傾向がある。
async function translateViaLibreTranslate(text: string, target: SupportedLang): Promise<string> {
  const libreTarget = toLibreTarget(target);
  const likelySource = detectLikelyLang(text);
  if (likelySource === libreTarget) {
    return text;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(TRANSLATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, source: likelySource ?? "auto", target: libreTarget, format: "text" }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`LibreTranslate responded with ${res.status}`);
    }
    const data = (await res.json()) as { translatedText: string };
    return data.translatedText;
  } finally {
    clearTimeout(timeout);
  }
}

// Ollama(ローカルLLM)経由の翻訳。主語省略のある日本語文でも、文脈を補って訳せる傾向がある。
// LibreTranslateより応答が遅く、タイムアウトの可能性も高いため、短めのタイムアウトを設定している。
async function translateViaOllama(text: string, target: SupportedLang): Promise<string> {
  const prompt =
    `Detect the language of the following text, then translate it into ${LANG_NAME[target]}. ` +
    `Output ONLY the translated text, with no explanation, no quotes, and no additional commentary.\n\n` +
    `Text:\n${text}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Ollama responded with ${res.status}`);
    }
    const data = (await res.json()) as { response?: string };
    const translated = (data.response ?? "").trim();
    if (!translated) {
      throw new Error("Ollama returned an empty response");
    }
    return translated;
  } finally {
    clearTimeout(timeout);
  }
}

// 翻訳に失敗した場合(エンジン未起動、モデル未読み込み、タイムアウト等)は、
// 元のテキストをそのまま返し、参考訳が使えない旨をnoteに残す。
// 通知・メッセージ機能自体は翻訳エンジンの有無に関わらず動作し続ける。
export async function translateText(text: string, target: SupportedLang): Promise<TranslateResult> {
  if (!text || !text.trim()) {
    return { translatedText: "" };
  }

  const trimmedText = text.trim();
  const commonTranslation = COMMON_TRANSLATIONS[trimmedText]?.[target];
  if (commonTranslation) {
    return {
      translatedText: commonTranslation,
      note: `${LANG_NAME[target]}への参考訳（定型文としてあらかじめ用意した対訳。AI翻訳エンジンは使用していません）`,
    };
  }

  if (TRANSLATION_PROVIDER === "ollama") {
    try {
      const translatedText = await translateViaOllama(text, target);
      return { translatedText, note: `${LANG_NAME[target]}への参考訳（Ollama / ${OLLAMA_MODEL}によるAI翻訳）` };
    } catch (err) {
      console.error("Ollamaでの翻訳に失敗したため、LibreTranslateへフォールバックします:", err);
    }
  }

  try {
    const translatedText = await translateViaLibreTranslate(text, target);
    if (translatedText === text) {
      return { translatedText: text, note: "入力文が翻訳先の言語と同じと判定されたため、原文を表示しています" };
    }
    return { translatedText };
  } catch (err) {
    console.error("翻訳エンジンの呼び出しに失敗しました(参考訳は利用できません):", err);
    return {
      translatedText: text,
      note: "翻訳エンジンに接続できなかったため、元の日本語を表示しています",
    };
  }
}
