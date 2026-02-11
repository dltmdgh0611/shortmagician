import { useState } from "react";
import { X, ChevronRight } from "lucide-react";

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (templateId: string) => void;
}

interface Template {
  id: string;
  title: string;
  description: string;
  image: string;
  isPopular?: boolean;
}

const popularTemplates: Template[] = [
  {
    id: "sseol",
    title: "썰 쇼츠",
    description: "재밌는 썰, 에피소드를 쇼츠로",
    image: "/썰쇼츠.png",
    isPopular: true,
  },
  {
    id: "general",
    title: "일반 쇼츠",
    description: "다양한 주제의 일반 쇼츠",
    image: "/일반쇼츠.png",
    isPopular: true,
  },
  {
    id: "animal",
    title: "동물 AI 쇼츠",
    description: "귀여운 동물 AI 콘텐츠",
    image: "/동물쇼츠.png",
    isPopular: true,
  },
];

const moreTemplates: Template[] = [
  {
    id: "news",
    title: "뉴스 쇼츠",
    description: "뉴스 스타일의 정보 전달",
    image: "/일반쇼츠.png",
  },
  {
    id: "review",
    title: "리뷰 쇼츠",
    description: "제품/서비스 리뷰 콘텐츠",
    image: "/일반쇼츠.png",
  },
  {
    id: "tutorial",
    title: "튜토리얼 쇼츠",
    description: "간단한 설명 영상",
    image: "/일반쇼츠.png",
  },
  {
    id: "vlog",
    title: "브이로그 쇼츠",
    description: "일상 기록 콘텐츠",
    image: "/일반쇼츠.png",
  },
  {
    id: "food",
    title: "먹방 쇼츠",
    description: "음식 관련 콘텐츠",
    image: "/일반쇼츠.png",
  },
  {
    id: "travel",
    title: "여행 쇼츠",
    description: "여행지 소개 콘텐츠",
    image: "/일반쇼츠.png",
  },
];

export function TemplateModal({ isOpen, onClose, onSelect }: TemplateModalProps) {
  const [showMore, setShowMore] = useState(false);

  if (!isOpen) return null;

  const handleSelect = (templateId: string) => {
    onSelect(templateId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl w-full max-w-2xl mx-4 shadow-2xl animate-slideUp max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">새 프로젝트</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              어떤 쇼츠를 만들어볼까요?
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Popular Templates */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🔥</span>
              <h3 className="font-semibold text-gray-900">인기 템플릿</h3>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {popularTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template.id)}
                  className="group relative bg-gray-50 rounded-2xl overflow-hidden border-2 border-transparent hover:border-blue-500 transition-all hover:shadow-lg"
                >
                  {/* Image */}
                  <div className="aspect-[3/4] overflow-hidden bg-gray-100">
                    <img
                      src={template.image}
                      alt={template.title}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>

                  {/* Info */}
                  <div className="p-3 bg-white">
                    <div className="flex items-center gap-1.5 mb-1">
                      {template.isPopular && (
                        <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">
                          인기
                        </span>
                      )}
                    </div>
                    <h4 className="font-semibold text-gray-900 text-sm">
                      {template.title}
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {template.description}
                    </p>
                  </div>

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/5 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg">
                      선택하기
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* More Templates */}
          {showMore && (
            <div className="animate-slideUp">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">✨</span>
                <h3 className="font-semibold text-gray-900">더 많은 템플릿</h3>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {moreTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelect(template.id)}
                    className="group relative bg-gray-50 rounded-2xl overflow-hidden border-2 border-transparent hover:border-blue-500 transition-all hover:shadow-lg"
                  >
                    <div className="aspect-[3/4] overflow-hidden bg-gray-100">
                      <img
                        src={template.image}
                        alt={template.title}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 opacity-70"
                      />
                    </div>
                    <div className="p-3 bg-white">
                      <h4 className="font-semibold text-gray-900 text-sm">
                        {template.title}
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {template.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Show More Button */}
          {!showMore && (
            <button
              onClick={() => setShowMore(true)}
              className="w-full mt-4 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <span>더 많은 템플릿 보기</span>
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
