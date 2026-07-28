import { Router } from "express";
import { requireAuth, AuthRequest } from "../auth/middleware";
import { translateText, SupportedLang } from "../translation/translate";

const router = Router();

const SUPPORTED_LANGS: SupportedLang[] = ["en", "zh"];

// 通知・メッセージ本文の参考翻訳(学生・職員どちらも利用可能)
// あくまで内容理解の補助であり、公式な翻訳文書ではないことを前提とする
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { text, target } = req.body;

  if (!text || typeof text !== "string") {
    return res.status(400).json({ status: "error", message: "翻訳するテキストを指定してください" });
  }
  if (!SUPPORTED_LANGS.includes(target)) {
    return res.status(400).json({ status: "error", message: "対応していない言語です（en / zhのみ）" });
  }

  const result = await translateText(text, target as SupportedLang);
  res.json({ status: "ok", translatedText: result.translatedText, note: result.note });
});

export default router;
