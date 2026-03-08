import { useNavigate } from "react-router-dom";
import { LayoutTemplate } from "lucide-react";

export function Templates() {
  const navigate = useNavigate();

  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-center p-12 bg-white rounded-3xl border border-gray-200 shadow-sm max-w-md">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <LayoutTemplate size={32} className="text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">템플릿</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-6 whitespace-pre-line">
          아직 준비중인 기능입니다.{"\n"}곧 다양한 템플릿을 만나보실 수 있습니다!
        </p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors text-sm"
        >
          홈으로 돌아가기
        </button>
      </div>
    </div>
  );
}
