import { X, ImageIcon, Wand2, Search, Loader2 } from "lucide-react";
import { useState } from "react";

interface ShortsRightPanelProps {
  selectedSceneId?: number | null;
  onClose?: () => void;
}

// 더미 추천 이미지 데이터
const recommendedImages = [
  { id: 1, url: "https://picsum.photos/seed/cafe1/200/150", label: "카페 내부" },
  { id: 2, url: "https://picsum.photos/seed/cafe2/200/150", label: "커피잔" },
  { id: 3, url: "https://picsum.photos/seed/people1/200/150", label: "손님들" },
  { id: 4, url: "https://picsum.photos/seed/barista/200/150", label: "바리스타" },
  { id: 5, url: "https://picsum.photos/seed/coffee/200/150", label: "라떼아트" },
  { id: 6, url: "https://picsum.photos/seed/sugar/200/150", label: "설탕" },
];

export function ShortsRightPanel({ selectedSceneId, onClose }: ShortsRightPanelProps) {
  const [activeTab, setActiveTab] = useState<"recommend" | "ai">("recommend");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);

  // 장면이 선택되지 않으면 패널 숨김
  if (selectedSceneId === null || selectedSceneId === undefined) {
    return null;
  }

  const handleGenerateImage = () => {
    if (!aiPrompt.trim()) return;
    
    setIsGenerating(true);
    setGeneratedImage(null);
    
    // 더미: 2초 후 랜덤 이미지 생성
    setTimeout(() => {
      const randomSeed = Math.random().toString(36).substring(7);
      setGeneratedImage(`https://picsum.photos/seed/${randomSeed}/400/300`);
      setIsGenerating(false);
    }, 2000);
  };

  const handleSelectImage = (imageId: number) => {
    setSelectedImageId(selectedImageId === imageId ? null : imageId);
  };

  return (
    <aside className="w-full md:w-80 bg-white md:border-l border-gray-200 flex flex-col shrink-0">
      {/* Header with close button */}
      <div className="h-10 px-2 md:px-4 flex items-center justify-between border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          장면 #{selectedSceneId} 이미지
        </span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <X size={16} className="text-gray-500" />
        </button>
      </div>

      {/* Tabs - 2개로 변경 */}
      <div className="flex items-center px-2 py-2 border-b border-gray-100 gap-2 bg-gray-50">
        <TabButton
          active={activeTab === "recommend"}
          onClick={() => setActiveTab("recommend")}
          icon={<Search size={16} />}
          label="추천 이미지"
        />
        <TabButton
          active={activeTab === "ai"}
          onClick={() => setActiveTab("ai")}
          icon={<Wand2 size={16} />}
          label="AI 이미지"
        />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "recommend" ? (
          /* 추천 이미지 탭 */
          <div className="p-3 md:p-4">
            {/* Search input */}
            <div className="relative mb-3 md:mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="이미지 검색..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {/* 이미지 그리드 */}
            <div className="grid grid-cols-2 md:grid-cols-2 gap-2">
              {recommendedImages.map((img) => (
                <div
                  key={img.id}
                  onClick={() => handleSelectImage(img.id)}
                  className={`
                    relative aspect-video rounded-lg overflow-hidden cursor-pointer transition-all
                    ${selectedImageId === img.id
                      ? "ring-2 ring-emerald-500 ring-offset-2"
                      : "hover:ring-2 hover:ring-emerald-300"
                    }
                  `}
                >
                  <img
                    src={img.url}
                    alt={img.label}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <span className="text-[10px] text-white font-medium">{img.label}</span>
                  </div>
                  {selectedImageId === img.id && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 선택된 이미지 적용 버튼 */}
            {selectedImageId && (
              <button className="w-full mt-3 md:mt-4 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors">
                이미지 적용하기
              </button>
            )}

            <p className="text-[10px] text-gray-400 text-center mt-3">
              스크립트 내용에 맞는 추천 이미지입니다
            </p>
          </div>
        ) : (
          /* AI 이미지 탭 */
          <div className="p-3 md:p-4">
            {/* AI prompt input */}
            <div className="mb-3 md:mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-2">
                이미지 설명
              </label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="생성할 이미지를 자세히 설명해주세요...&#10;예: 따뜻한 조명의 아늑한 카페 내부, 나무 테이블 위에 놓인 라떼"
                rows={4}
                className="w-full p-3 text-xs md:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              />
            </div>

            {/* 생성 버튼 */}
            <button
              onClick={handleGenerateImage}
              disabled={isGenerating || !aiPrompt.trim()}
              className={`
                w-full py-2.5 text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2
                ${isGenerating || !aiPrompt.trim()
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-gradient-to-r from-purple-500 to-indigo-500 hover:opacity-90"
                }
              `}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>생성 중...</span>
                </>
              ) : (
                <>
                  <Wand2 size={16} />
                  <span>이미지 생성하기</span>
                </>
              )}
            </button>

            {/* 생성 결과 */}
            <div className="mt-3 md:mt-4">
              {isGenerating ? (
                <div className="aspect-video bg-gray-100 rounded-lg flex flex-col items-center justify-center gap-3 border border-gray-200">
                  <Loader2 size={32} className="text-purple-500 animate-spin" />
                  <p className="text-xs text-gray-500">AI가 이미지를 생성하고 있습니다...</p>
                </div>
              ) : generatedImage ? (
                <div className="space-y-3">
                  <div className="relative aspect-video rounded-lg overflow-hidden border border-gray-200">
                    <img
                      src={generatedImage}
                      alt="AI 생성 이미지"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button className="flex-1 py-2 bg-purple-500 text-white text-xs md:text-sm font-medium rounded-lg hover:bg-purple-600 transition-colors">
                      이미지 적용
                    </button>
                    <button
                      onClick={handleGenerateImage}
                      className="px-3 md:px-4 py-2 border border-gray-200 text-gray-700 text-xs md:text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      다시 생성
                    </button>
                  </div>
                </div>
              ) : (
                <div className="aspect-video bg-gray-50 rounded-lg flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200">
                  <ImageIcon size={32} className="text-gray-300" />
                  <p className="text-xs text-gray-400 text-center">
                    설명을 입력하고<br />이미지를 생성해보세요
                  </p>
                </div>
              )}
            </div>

            <p className="text-[10px] text-gray-400 text-center mt-3">
              AI가 프롬프트를 기반으로 이미지를 생성합니다
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function TabButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 flex items-center justify-center gap-1 md:gap-2 py-2.5 rounded-lg text-[10px] md:text-xs font-medium transition-all
        ${
          active
            ? "bg-white text-blue-600 shadow-sm border border-gray-200"
            : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
        }
      `}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
