import { X } from "lucide-react";
import type { SubtitleStyle } from "../../lib/types/pipeline";

interface ShortsRightPanelProps {
  selectedSceneId?: number | null;
  onClose?: () => void;
  selectedSubtitleId?: string | null;
  onSubtitleClose?: () => void;
  subtitleStyle?: SubtitleStyle;
  onSubtitleStyleChange?: (style: SubtitleStyle) => void;
}

export function ShortsRightPanel({ selectedSceneId, onClose, selectedSubtitleId, onSubtitleClose, subtitleStyle, onSubtitleStyleChange }: ShortsRightPanelProps) {

  // 장면이 선택되지 않으면 패널 숨김
  if (selectedSubtitleId && subtitleStyle && onSubtitleStyleChange) {
    return (
      <aside className="w-full md:w-80 bg-white md:border-l border-gray-200 flex flex-col shrink-0">
        <div className="h-10 px-2 md:px-4 flex items-center justify-between border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            자막 스타일
          </span>
          <button onClick={onSubtitleClose} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
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

          {/* Background Color */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">배경</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSubtitleStyleChange({ ...subtitleStyle, backgroundColor: 'transparent' })}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  subtitleStyle.backgroundColor === 'transparent'
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                없음
              </button>
              <input
                type="color"
                value={subtitleStyle.backgroundColor === 'transparent' ? '#000000' : subtitleStyle.backgroundColor}
                onChange={(e) => onSubtitleStyleChange({ ...subtitleStyle, backgroundColor: e.target.value })}
                className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </aside>
    );
  }
  return null;
}
