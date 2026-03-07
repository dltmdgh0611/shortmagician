export interface LanguageInfo {
  code: string;
  name: string;
  flag: string;
  default?: boolean;
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: "ko", name: "한국어", flag: "🇰🇷", default: true },
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "es", name: "Español", flag: "🇪🇸" },
];

export type SupportedLanguageCode = "ko" | "en" | "ja" | "zh" | "es";
