import { UploadCloud } from "lucide-react";

export function Upload() {
  return (
    <div className="max-w-4xl mx-auto p-8 h-full flex flex-col items-center justify-center">
      <div className="w-full max-w-lg aspect-[3/2] border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center bg-white hover:bg-gray-50 hover:border-blue-400 transition-all cursor-pointer group shadow-sm">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-blue-50 transition-all">
          <UploadCloud
            size={40}
            className="text-gray-400 group-hover:text-blue-500"
          />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          미디어 업로드
        </h3>
        <p className="text-gray-500 text-sm">
          또는 파일을 여기로 드래그 앤 드롭하세요
        </p>
        <button className="mt-6 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-500/20">
          파일 선택
        </button>
      </div>
    </div>
  );
}
