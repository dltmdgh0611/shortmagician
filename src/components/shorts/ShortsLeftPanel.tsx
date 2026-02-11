import { Play, SkipBack, SkipForward } from "lucide-react";

export function ShortsLeftPanel() {
  // 더미 데이터 - 현재 시간과 전체 시간
  const currentTime = 12; // 초
  const totalTime = 60; // 초
  const progress = (currentTime / totalTime) * 100;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <aside className="w-80 lg:w-96 flex flex-col border-r border-gray-200 bg-white shrink-0">
      {/* Header */}
      <div className="h-10 px-4 flex items-center border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Preview
        </span>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 flex flex-col bg-gray-100 relative group p-4 gap-4 overflow-hidden">
        {/* Vertical Video Container - 19.5:9 비율 */}
        <div className="flex-1 flex items-center justify-center overflow-hidden min-h-0">
          <img 
            src="/썰쇼츠_메인.png" 
            alt="썰쇼츠_메인"
            className="rounded-xl border border-gray-200 object-cover shadow-sm w-full"
            style={{ 
              aspectRatio: '9 / 19.5',
            }}
          />
        </div>

        {/* Playback Controls with Progress */}
        <div className="bg-white rounded-xl border border-gray-200 shrink-0 shadow-sm overflow-hidden">
          {/* Progress Bar */}
          <div className="h-1 bg-gray-200 cursor-pointer group/progress">
            <div 
              className="h-full bg-blue-500 relative transition-all"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue-500 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Controls Row */}
          <div className="h-12 flex items-center justify-between px-4">
            {/* Time Display */}
            <span className="text-xs text-gray-500 font-medium w-20">
              {formatTime(currentTime)} / {formatTime(totalTime)}
            </span>

            {/* Play Controls */}
            <div className="flex items-center gap-3">
              <button className="text-gray-400 hover:text-gray-700 transition-colors">
                <SkipBack size={18} />
              </button>
              <button className="w-9 h-9 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors shadow-md">
                <Play size={16} className="ml-0.5" fill="currentColor" />
              </button>
              <button className="text-gray-400 hover:text-gray-700 transition-colors">
                <SkipForward size={18} />
              </button>
            </div>

            {/* Spacer to balance layout */}
            <div className="w-20" />
          </div>
        </div>
      </div>
    </aside>
  );
}
