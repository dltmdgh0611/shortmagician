import { useState } from "react";
import { Trash2, Mic, Image as ImageIcon, Wand2, Type, Clock, Plus, ChevronDown, Volume2 } from "lucide-react";

export interface Scene {
  id: number;
  text: string;
  duration: number;
}

interface ShortsCenterPanelProps {
  scenes: Scene[];
  onScenesChange: (scenes: Scene[]) => void;
  languages?: string[];
  selectedLanguage?: string;
  onLanguageChange?: (lang: string) => void;
  selectedSceneId?: number | null;
  onSceneSelect?: (id: number | null) => void;
}

const languageNames: Record<string, { name: string; flag: string }> = {
  ko: { name: "한국어", flag: "🇰🇷" },
  en: { name: "English", flag: "🇺🇸" },
  ja: { name: "日本語", flag: "🇯🇵" },
  zh: { name: "中文", flag: "🇨🇳" },
  es: { name: "Español", flag: "🇪🇸" },
  vi: { name: "Tiếng Việt", flag: "🇻🇳" },
  th: { name: "ภาษาไทย", flag: "🇹🇭" },
  id: { name: "Bahasa", flag: "🇮🇩" },
};

// 다국어 번역 함수 (더미)
function translateScene(scene: Scene, targetLang: string): Scene {
  const translations: Record<string, Record<string, string>> = {
    // 시연용 고정 스크립트 번역
    "하루 5분 혈액순환 운동": {
      ja: "1日5分の血液循環運動",
      en: "5-minute daily blood circulation exercise",
      zh: "每天5分钟血液循环运动",
    },
    "하루 5분 이 운동만으로도": {
      ja: "1日5分のこの運動だけでも",
      en: "Just 5 minutes of this exercise daily",
      zh: "每天只需5分钟这个运动",
    },
    "혈액순환이 달라집니다": {
      ja: "血液循環が変わります",
      en: "Your blood circulation will change",
      zh: "血液循环会改变",
    },
    "특별한 도구는 필요 없습니다": {
      ja: "特別な道具は必要ありません",
      en: "No special equipment needed",
      zh: "不需要特别的工具",
    },
    // 기존 번역
    "여러분 이거 실화임": {
      en: "This is a true story guys",
      ja: "これマジで実話",
      zh: "这是真事儿",
      es: "Esto es una historia real",
    },
    "저번에 카페 알바할 때": {
      en: "When I was working at a cafe",
      ja: "カフェでバイトしてた時",
      zh: "上次在咖啡店打工的时候",
      es: "Cuando trabajaba en un café",
    },
    "어떤 중년 부부가 왔음": {
      en: "A middle-aged couple came in",
      ja: "中年の夫婦が来た",
      zh: "来了一对中年夫妇",
      es: "Llegó una pareja de mediana edad",
    },
    "평소처럼 앉아 있다가 일어나서 계산하러 오셨는데": {
      en: "They were sitting as usual, then came to pay",
      ja: "いつも通り座ってて、会計しに来たんだけど",
      zh: "像往常一样坐着，然后来结账",
      es: "Estaban sentados como siempre, luego vinieron a pagar",
    },
    '아저씨가 "야 이 찌꺼기 뭐야?" 하면서 컵을 들이대셨음': {
      en: 'The man said "Hey, what\'s this residue?" showing me the cup',
      ja: 'おじさんが「おい、このカスは何だ？」ってコップ見せてきた',
      zh: '大叔说"喂，这残渣是什么？"把杯子递过来',
      es: 'El señor dijo "Oye, ¿qué es este residuo?" mostrándome la taza',
    },
    "보니까 컵 바닥에 뭔가 있긴 했음": {
      en: "I looked and there was something at the bottom",
      ja: "見たらコップの底に何かあった",
      zh: "看了一下杯底确实有东西",
      es: "Miré y había algo en el fondo",
    },
    "근데 그게 아저씨가 넣은 각설탕이었음": {
      en: "But it was the sugar cube he put in himself",
      ja: "でもそれおじさんが入れた角砂糖だった",
      zh: "但那是大叔自己放的方糖",
      es: "Pero era el azúcar que él mismo puso",
    },
    "구독 안 하면 여러분한테도 이런 손님 옴": {
      en: "If you don't subscribe, you'll get customers like this too",
      ja: "チャンネル登録しないとこういう客来るよ",
      zh: "不订阅的话你也会遇到这种客人",
      es: "Si no te suscribes, también te llegarán clientes así",
    },
  };

  if (targetLang === "ko") return scene;

  const translatedText = translations[scene.text]?.[targetLang] || scene.text;
  return { ...scene, text: translatedText };
}

// TTS 음성 목록 (언어별)
const ttsVoicesByLang: Record<string, { id: string; name: string; description: string; gender: string; lang: string }[]> = {
  ko: [
    { id: "minsu", name: "민수", description: "차분한 톤", gender: "남성", lang: "한국어" },
    { id: "jiyeon", name: "지연", description: "밝은 톤", gender: "여성", lang: "한국어" },
    { id: "suho", name: "수호", description: "또렷한 톤", gender: "남성", lang: "한국어" },
    { id: "nara", name: "나라", description: "부드러운 톤", gender: "여성", lang: "한국어" },
    { id: "junho", name: "준호", description: "힘찬 톤", gender: "남성", lang: "한국어" },
    { id: "yuna", name: "유나", description: "아나운서 톤", gender: "여성", lang: "한국어" },
    { id: "dongwook", name: "동욱", description: "내레이션 톤", gender: "남성", lang: "한국어" },
    { id: "soyeon", name: "소연", description: "감성적 톤", gender: "여성", lang: "한국어" },
  ],
  ja: [
    { id: "takeshi", name: "Takeshi", description: "落ち着いたトーン (일본어)", gender: "男性", lang: "日本語" },
    { id: "yuki", name: "Yuki", description: "明るいトーン (일본어)", gender: "女性", lang: "日本語" },
    { id: "kenji", name: "Kenji", description: "はっきりしたトーン (일본어)", gender: "男性", lang: "日本語" },
    { id: "sakura", name: "Sakura", description: "柔らかいトーン (일본어)", gender: "女性", lang: "日本語" },
    { id: "hiroshi", name: "Hiroshi", description: "力強いトーン (일본어)", gender: "男性", lang: "日本語" },
    { id: "aoi", name: "Aoi", description: "アナウンサートーン (일본어)", gender: "女性", lang: "日本語" },
    { id: "ryota", name: "Ryota", description: "ナレーショントーン (일본어)", gender: "男性", lang: "日本語" },
    { id: "miku", name: "Miku", description: "感性的なトーン (일본어)", gender: "女性", lang: "日本語" },
  ],
  en: [
    { id: "john", name: "John", description: "Calm tone (영어)", gender: "Male", lang: "English" },
    { id: "emma", name: "Emma", description: "Bright tone (영어)", gender: "Female", lang: "English" },
    { id: "michael", name: "Michael", description: "Clear tone (영어)", gender: "Male", lang: "English" },
    { id: "sophia", name: "Sophia", description: "Soft tone (영어)", gender: "Female", lang: "English" },
  ],
};

// 언어별 기본 음성 ID
const defaultVoiceByLang: Record<string, string> = {
  ko: "minsu",
  ja: "takeshi",
  en: "john",
};

export function ShortsCenterPanel({ 
  scenes,
  onScenesChange,
  languages = ["ko"], 
  selectedLanguage = "ko",
  onLanguageChange,
  selectedSceneId,
  onSceneSelect,
}: ShortsCenterPanelProps) {
  // 각 씬별 음성 드롭다운 열림 상태
  const [openVoiceDropdownId, setOpenVoiceDropdownId] = useState<number | null>(null);
  // 각 씬별 선택된 음성 (언어별로 관리)
  const [sceneVoices, setSceneVoices] = useState<Record<number, Record<string, string>>>({});

  // 현재 언어에 맞는 음성 목록 가져오기
  const currentVoices = ttsVoicesByLang[selectedLanguage] || ttsVoicesByLang.ko;
  const defaultVoiceId = defaultVoiceByLang[selectedLanguage] || "minsu";

  const getSceneVoice = (sceneId: number) => {
    const voiceId = sceneVoices[sceneId]?.[selectedLanguage] || defaultVoiceId;
    return currentVoices.find(v => v.id === voiceId) || currentVoices[0];
  };

  const handleVoiceChange = (sceneId: number, voiceId: string) => {
    setSceneVoices(prev => ({
      ...prev,
      [sceneId]: {
        ...prev[sceneId],
        [selectedLanguage]: voiceId,
      },
    }));
    setOpenVoiceDropdownId(null);
  };

  // 현재 선택된 언어에 맞게 scenes 번역
  const displayScenes = scenes.map(s => translateScene(s, selectedLanguage));
  const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);

  const handleSceneTextChange = (id: number, text: string) => {
    // 한국어일 때만 원본 수정 가능
    if (selectedLanguage === "ko") {
      const updated = scenes.map((s) => (s.id === id ? { ...s, text } : s));
      onScenesChange(updated);
    }
  };

  const handleAddScene = () => {
    const newId = Math.max(...scenes.map(s => s.id), 0) + 1;
    onScenesChange([...scenes, { id: newId, text: "새 장면", duration: 3 }]);
  };

  const handleDeleteScene = (id: number) => {
    onScenesChange(scenes.filter(s => s.id !== id));
  };

  return (
    <main className="flex-1 flex flex-col bg-gray-50 min-w-0 overflow-hidden">
      {/* Toolbar */}
      <div className="h-12 border-b border-gray-200 flex items-center justify-between px-2 md:px-4 bg-white shrink-0">
        <div className="flex items-center gap-2 md:gap-3">
          <h2 className="text-sm font-semibold text-gray-900">스크립트 편집</h2>
          <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
            <Clock size={12} />
            <span>{totalDuration}초</span>
          </div>
          <span className="hidden sm:inline text-xs text-gray-400">
            {scenes.length}개 장면
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-medium rounded-lg transition-colors">
            <Wand2 size={14} />
            <span className="hidden sm:inline">AI 다듬기</span>
          </button>
        </div>
      </div>

      {/* Language Selector */}
      {languages.length > 1 && (
        <div className="px-2 md:px-4 py-3 bg-white border-b border-gray-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <span className="text-xs font-medium text-gray-500">언어:</span>
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto w-full sm:w-auto">
              {languages.map((lang) => (
                <button
                  key={lang}
                  onClick={() => onLanguageChange?.(lang)}
                  className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    selectedLanguage === lang
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <span>{languageNames[lang]?.flag}</span>
                  <span className="hidden sm:inline">{languageNames[lang]?.name}</span>
                </button>
              ))}
            </div>
            {selectedLanguage !== "ko" && (
              <span className="text-[10px] md:text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                자동 번역됨 · 원본은 한국어에서 수정
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-3">
        {/* Scenes List */}
        {displayScenes.map((scene, idx) => {
          const isActive = selectedSceneId === scene.id;
          return (
            <div
              key={scene.id}
              onClick={() => onSceneSelect?.(isActive ? null : scene.id)}
              className={`
                group relative flex gap-2 md:gap-4 p-3 md:p-4 rounded-xl border transition-all cursor-pointer
                ${
                  isActive
                    ? "bg-white border-blue-200 ring-2 ring-blue-100 shadow-sm"
                    : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
                }
              `}
            >
              {/* Index */}
              <div className="flex flex-col items-center gap-2 pt-1">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Editable Text */}
                <textarea
                  value={scene.text}
                  onChange={(e) => handleSceneTextChange(scene.id, e.target.value)}
                  disabled={selectedLanguage !== "ko"}
                  className={`w-full bg-transparent text-xs md:text-sm leading-relaxed resize-none focus:outline-none ${
                    selectedLanguage !== "ko" ? "mb-1" : "mb-2"
                  } ${
                    isActive ? "text-gray-900" : "text-gray-700"
                  } ${selectedLanguage !== "ko" ? "cursor-not-allowed" : ""}`}
                  rows={1}
                />

                {/* 원본 한국어 텍스트 (한국어 외 언어 선택 시) */}
                {selectedLanguage !== "ko" && (
                  <p className="text-[11px] text-gray-400 mb-2 pl-0.5">
                    🇰🇷 {scenes.find(s => s.id === scene.id)?.text}
                  </p>
                )}

                {/* Meta/Controls */}
                <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded flex items-center gap-1">
                    <Mic size={10} /> {scene.duration}초
                  </span>

                  {/* Voice Selection per Scene */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setOpenVoiceDropdownId(openVoiceDropdownId === scene.id ? null : scene.id)}
                      className="flex items-center gap-1 md:gap-1.5 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 text-[10px] font-medium rounded transition-colors"
                    >
                      <Volume2 size={10} />
                      <span>{getSceneVoice(scene.id).name}</span>
                      <ChevronDown size={10} className={`transition-transform ${openVoiceDropdownId === scene.id ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {openVoiceDropdownId === scene.id && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setOpenVoiceDropdownId(null)}
                        />
                        <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden">
                          <div className="p-2 border-b border-gray-100">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2">
                              음성 선택
                            </span>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {currentVoices.map((voice) => {
                              const isSelected = getSceneVoice(scene.id).id === voice.id;
                              const isMale = voice.gender === '남성' || voice.gender === '男性' || voice.gender === 'Male';
                              return (
                                <button
                                  key={voice.id}
                                  onClick={() => handleVoiceChange(scene.id, voice.id)}
                                  className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors ${
                                    isSelected ? 'bg-blue-50' : ''
                                  }`}
                                >
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                    isMale 
                                      ? 'bg-gradient-to-br from-blue-400 to-indigo-500' 
                                      : 'bg-gradient-to-br from-pink-400 to-rose-500'
                                  }`}>
                                    <Volume2 size={10} className="text-white" />
                                  </div>
                                  <div className="flex-1 text-left">
                                    <p className={`text-xs font-medium ${isSelected ? 'text-blue-600' : 'text-gray-900'}`}>
                                      {voice.name}
                                    </p>
                                    <p className="text-[10px] text-gray-500">{voice.description} · {voice.gender}</p>
                                  </div>
                                  {isSelected && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1 md:gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity ml-auto">
                    <ActionBtn icon={<ImageIcon size={12} className="md:w-3.5 md:h-3.5" />} label="이미지" />
                    <ActionBtn icon={<Type size={12} className="md:w-3.5 md:h-3.5" />} label="자막" />
                    <ActionBtn
                      icon={<Trash2 size={12} className="md:w-3.5 md:h-3.5" />}
                      label="삭제"
                      danger
                      onClick={() => handleDeleteScene(scene.id)}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add Scene Button */}
        <button
          onClick={handleAddScene}
          className="w-full p-3 md:p-4 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-all flex items-center justify-center gap-2"
        >
          <Plus size={16} className="md:w-[18px] md:h-[18px]" />
          <span className="text-xs md:text-sm font-medium">장면 추가</span>
        </button>
      </div>
    </main>
  );
}

function ActionBtn({
  icon,
  label,
  danger = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        p-1.5 rounded-lg transition-colors
        ${
          danger
            ? "hover:bg-red-50 hover:text-red-500 text-gray-400"
            : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"
        }
      `}
      title={label}
    >
      {icon}
    </button>
  );
}
