import { useState, useEffect, useRef } from "react";
import {
  X,
  Send,
  User,
  FileText,
  Copy,
  Check,
  ArrowRight,
} from "lucide-react";

interface ScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (script: string) => void;
  templateId: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface Scene {
  id: number;
  text: string;
  duration: number; // seconds
}

const templateNames: Record<string, string> = {
  sseol: "썰 쇼츠",
  general: "일반 쇼츠",
  animal: "동물 AI 쇼츠",
  news: "뉴스 쇼츠",
  review: "리뷰 쇼츠",
  tutorial: "튜토리얼 쇼츠",
  vlog: "브이로그 쇼츠",
  food: "먹방 쇼츠",
  travel: "여행 쇼츠",
};

const dummyResponses: Record<string, string[]> = {
  sseol: [
    "안녕하세요! 썰 쇼츠 제작을 도와드릴게요.\n\n어떤 썰을 쇼츠로 만들고 싶으신가요? 재밌었던 에피소드나 경험을 말씀해주세요!",
    `좋아요! 바이럴 될 만한 쇼츠 대본을 만들어볼게요.

---

**[Scene 1]** (2초)
여러분 이거 실화임

**[Scene 2]** (3초)
저번에 카페 알바할 때

**[Scene 3]** (3초)
어떤 중년 부부가 왔음

**[Scene 4]** (4초)
평소처럼 앉아 있다가 일어나서 계산하러 오셨는데

**[Scene 5]** (5초)
아저씨가 "야 이 찌꺼기 뭐야?" 하면서 컵을 들이대셨음

**[Scene 6]** (4초)
보니까 컵 바닥에 뭔가 있긴 했음

**[Scene 7]** (3초)
근데 그게 아저씨가 넣은 각설탕이었음

**[Scene 8]** (3초)
구독 안 하면 여러분한테도 이런 손님 옴

---

이 구조로 진행할까요? 수정이 필요하면 말씀해주세요!`,
    "완벽해요! 대본이 완성됐어요. 오른쪽에서 수정하실 수 있고, 마음에 드시면 편집을 시작해보세요!",
  ],
  general: [
    "안녕하세요! 일반 쇼츠 제작을 도와드릴게요.\n\n어떤 주제로 쇼츠를 만들고 싶으신가요?",
    `좋은 주제예요! 대본을 작성해볼게요.

---

**[Scene 1]** (2초)
이거 모르면 진짜 손해

**[Scene 2]** (4초)
오늘 알려드릴 꿀팁은 바로

**[Scene 3]** (5초)
핵심 내용을 전달합니다

**[Scene 4]** (3초)
더 궁금하면 팔로우!

---

이 구조로 진행할까요?`,
    "대본 완성! 편집 단계로 넘어가시면 됩니다.",
  ],
  animal: [
    "안녕하세요! 동물 AI 쇼츠 제작을 도와드릴게요.\n\n어떤 동물로 어떤 상황의 쇼츠를 만들고 싶으신가요?",
    `귀여운 아이디어네요! 대본을 만들어볼게요.

---

**[Scene 1]** (2초)
귀여운 동물 등장

**[Scene 2]** (5초)
동물의 재밌는 상황 1

**[Scene 3]** (5초)
동물의 재밌는 상황 2

**[Scene 4]** (3초)
구독하면 매일 귀여운 동물 영상!

---

이렇게 진행할까요?`,
    "완성됐어요! AI 이미지는 편집 단계에서 자동으로 생성됩니다.",
  ],
};

// Scene 데이터로 파싱
const defaultScenes: Scene[] = [
  { id: 1, text: "여러분 이거 실화임", duration: 2 },
  { id: 2, text: "저번에 카페 알바할 때", duration: 3 },
  { id: 3, text: "어떤 중년 부부가 왔음", duration: 3 },
  { id: 4, text: "평소처럼 앉아 있다가 일어나서 계산하러 오셨는데", duration: 4 },
  { id: 5, text: '아저씨가 "야 이 찌꺼기 뭐야?" 하면서 컵을 들이대셨음', duration: 5 },
  { id: 6, text: "보니까 컵 바닥에 뭔가 있긴 했음", duration: 4 },
  { id: 7, text: "근데 그게 아저씨가 넣은 각설탕이었음", duration: 3 },
  { id: 8, text: "구독 안 하면 여러분한테도 이런 손님 옴", duration: 3 },
];

export function ScriptModal({
  isOpen,
  onClose,
  onComplete,
  templateId,
}: ScriptModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [responseIndex, setResponseIndex] = useState(0);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const templateName = templateNames[templateId] || "쇼츠";
  const responses = dummyResponses[templateId] || dummyResponses.general;

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setInput("");
      setResponseIndex(0);
      setScenes([]);
      
      // Initial AI greeting
      setTimeout(() => {
        setMessages([
          {
            id: "1",
            role: "assistant",
            content: responses[0],
          },
        ]);
      }, 300);
    }
  }, [isOpen, templateId]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!isOpen) return null;

  const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);

  const handleSend = () => {
    if (!input.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const nextIndex = responseIndex + 1;
      const aiResponse = responses[nextIndex] || responses[responses.length - 1];

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: aiResponse,
        },
      ]);
      setResponseIndex(nextIndex);
      setIsTyping(false);

      // Generate scenes after second response
      if (nextIndex >= 1 && scenes.length === 0) {
        setScenes(defaultScenes);
      }
    }, 1200);
  };

  const handleSceneTextChange = (id: number, text: string) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, text } : s))
    );
  };

  const handleCopy = () => {
    const scriptText = scenes
      .map((s, idx) => `[Scene ${idx + 1}] (${s.duration}초)\n${s.text}`)
      .join("\n\n");
    navigator.clipboard.writeText(scriptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleComplete = () => {
    // Save scenes as JSON
    sessionStorage.setItem("currentScenes", JSON.stringify(scenes));
    sessionStorage.setItem("currentTemplate", templateId);
    onComplete(JSON.stringify(scenes));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl w-full max-w-4xl mx-4 shadow-2xl animate-slideUp h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">{templateName}</h2>
            <p className="text-sm text-gray-500">AI 대본 작성</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleComplete}
              disabled={scenes.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                scenes.length > 0
                  ? "bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              <span>편집 시작하기</span>
              <ArrowRight size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Chat */}
          <div className="flex-1 flex flex-col border-r border-gray-100">
            {/* Chat Header */}
            <div className="h-11 px-4 flex items-center border-b border-gray-100 bg-gray-50/50">
              <img src="/logo.png" alt="AI" className="w-5 h-5 rounded-full object-cover mr-2" />
              <span className="text-sm font-medium text-gray-700">
                AI 대본 어시스턴트
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    msg.role === "user" ? "justify-end" : ""
                  }`}
                >
                  {msg.role === "assistant" && (
                    <img src="/logo.png" alt="AI" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-blue-500 text-white"
                        : "bg-white text-gray-800 shadow-sm border border-gray-100"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </p>
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                      <User size={14} className="text-gray-600" />
                    </div>
                  )}
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-3">
                  <img src="/logo.png" alt="AI" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                      <span
                        className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      />
                      <span
                        className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-100 bg-white">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="썰이나 아이디어를 입력해주세요..."
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  className="px-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Right: Scene Editor */}
          <div className="w-[380px] flex flex-col bg-white">
            {/* Script Header */}
            <div className="h-11 px-4 flex items-center justify-between border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-emerald-500" />
                <span className="text-sm font-medium text-gray-700">대본</span>
                {scenes.length > 0 && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {totalDuration}초
                  </span>
                )}
              </div>
              {scenes.length > 0 && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "복사됨" : "복사"}
                </button>
              )}
            </div>

            {/* Scene List */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {scenes.length > 0 ? (
                scenes.map((scene, idx) => (
                  <div
                    key={scene.id}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-blue-600">
                        Scene {idx + 1}
                      </span>
                      <span className="text-xs text-gray-400">
                        {scene.duration}초
                      </span>
                    </div>
                    <textarea
                      value={scene.text}
                      onChange={(e) => handleSceneTextChange(scene.id, e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg p-2 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-700 min-h-[60px]"
                    />
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <FileText size={40} className="mb-3 opacity-40" />
                  <p className="text-sm text-center">
                    AI와 대화하면
                    <br />
                    대본이 여기에 생성됩니다
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
