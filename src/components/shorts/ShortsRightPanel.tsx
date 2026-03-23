import { Trash2 } from "lucide-react";
import type { SubtitleStyle } from "../../lib/types/pipeline";
import type { TextOverlay } from "../../pages/ShortsEditor";

interface ShortsRightPanelProps {
  selectedSceneId?: number | null;
  onClose?: () => void;
  selectedSubtitleId?: string | null;
  onSubtitleClose?: () => void;
  subtitleStyle?: SubtitleStyle;
  onSubtitleStyleChange?: (style: SubtitleStyle) => void;
  selectedTextOverlay?: TextOverlay | null;
  onTextOverlayChange?: (id: string, updates: Partial<TextOverlay>) => void;
  onTextOverlayDelete?: (id: string) => void;
  onTextOverlayClose?: () => void;
}

export function ShortsRightPanel({ selectedSubtitleId, subtitleStyle, onSubtitleStyleChange, selectedTextOverlay, onTextOverlayChange, onTextOverlayDelete }: ShortsRightPanelProps) {

  // Text overlay editing panel
  if (selectedTextOverlay && onTextOverlayChange) {
    return (
      <aside className="w-full md:w-80 bg-white md:border-l border-gray-200 flex flex-col shrink-0">
        <div className="h-10 px-2 md:px-4 flex items-center justify-between border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            텍스트 편집
          </span>
          {onTextOverlayDelete && (
            <button
              onClick={() => onTextOverlayDelete(selectedTextOverlay.id)}
              className="p-1 hover:bg-red-50 rounded-lg transition-colors group"
              title="삭제"
            >
              <Trash2 size={16} className="text-gray-400 group-hover:text-red-500" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Text content */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">텍스트</label>
            <input
              type="text"
              value={selectedTextOverlay.text}
              onChange={(e) => onTextOverlayChange(selectedTextOverlay.id, { text: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Font Size */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">글꼴 크기 ({selectedTextOverlay.fontSize})</label>
            <input
              type="range"
              min={20}
              max={150}
              value={selectedTextOverlay.fontSize}
              onChange={(e) => onTextOverlayChange(selectedTextOverlay.id, { fontSize: Number(e.target.value) })}
              className="w-full accent-blue-500"
            />
          </div>

          {/* Font Color */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">색상</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selectedTextOverlay.fontColor}
                onChange={(e) => onTextOverlayChange(selectedTextOverlay.id, { fontColor: e.target.value })}
                className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
              />
              <span className="text-xs text-gray-500 font-mono">{selectedTextOverlay.fontColor}</span>
            </div>
          </div>

          {/* Bold toggle */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">스타일</label>
            <button
              onClick={() => onTextOverlayChange(selectedTextOverlay.id, { bold: !selectedTextOverlay.bold })}
              className={`px-4 py-2 text-sm font-bold rounded-lg border transition-colors ${
                selectedTextOverlay.bold
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              B
            </button>
          </div>

          {/* Delete button */}
          {onTextOverlayDelete && (
            <button
              onClick={() => onTextOverlayDelete(selectedTextOverlay.id)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg border border-red-200 transition-colors"
            >
              <Trash2 size={14} />
              <span>텍스트 삭제</span>
            </button>
          )}
        </div>
      </aside>
    );
  }

  // Subtitle style editing panel
  if (selectedSubtitleId && subtitleStyle && onSubtitleStyleChange) {
    return (
      <aside className="w-full md:w-80 bg-white md:border-l border-gray-200 flex flex-col shrink-0">
        <div className="h-10 px-2 md:px-4 flex items-center justify-between border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            자막 스타일
          </span>
          <span />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Font Family */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">글꼴</label>
            <select
              value={subtitleStyle.fontFamily}
              onChange={(e) => onSubtitleStyleChange({ ...subtitleStyle, fontFamily: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Noto Sans CJK KR">Noto Sans CJK KR</option>
              <option value="Noto Sans CJK JP">Noto Sans CJK JP</option>
              <option value="Noto Sans CJK SC">Noto Sans CJK SC</option>
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Impact">Impact</option>
            </select>
          </div>

          {/* Font Size */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">글꼴 크기 ({subtitleStyle.fontSize})</label>
            <input
              type="range"
              min={40}
              max={120}
              value={subtitleStyle.fontSize}
              onChange={(e) => onSubtitleStyleChange({ ...subtitleStyle, fontSize: Number(e.target.value) })}
              className="w-full accent-blue-500"
            />
          </div>

          {/* Font Color */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">글꼴 색상</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={subtitleStyle.fontColor}
                onChange={(e) => onSubtitleStyleChange({ ...subtitleStyle, fontColor: e.target.value })}
                className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
              />
              <span className="text-xs text-gray-500 font-mono">{subtitleStyle.fontColor}</span>
            </div>
          </div>

          {/* Bold / Italic toggles */}
          <div className="flex gap-2">
            <button
              onClick={() => onSubtitleStyleChange({ ...subtitleStyle, bold: !subtitleStyle.bold })}
              className={`flex-1 py-2 text-sm font-bold rounded-lg border transition-colors ${
                subtitleStyle.bold
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              B
            </button>
            <button
              onClick={() => onSubtitleStyleChange({ ...subtitleStyle, italic: !subtitleStyle.italic })}
              className={`flex-1 py-2 text-sm italic rounded-lg border transition-colors ${
                subtitleStyle.italic
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              I
            </button>
          </div>

          {/* Outline Color */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">외곽선 색상</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={subtitleStyle.outlineColor}
                onChange={(e) => onSubtitleStyleChange({ ...subtitleStyle, outlineColor: e.target.value })}
                className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
              />
              <span className="text-xs text-gray-500 font-mono">{subtitleStyle.outlineColor}</span>
            </div>
          </div>

          {/* Outline Width */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">외곽선 두께 ({subtitleStyle.outlineWidth})</label>
            <input
              type="range"
              min={0}
              max={10}
              value={subtitleStyle.outlineWidth}
              onChange={(e) => onSubtitleStyleChange({ ...subtitleStyle, outlineWidth: Number(e.target.value) })}
              className="w-full accent-blue-500"
            />
          </div>


        </div>
      </aside>
    );
  }
  return null;
}
