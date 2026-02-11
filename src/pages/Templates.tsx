import { useNavigate } from "react-router-dom";

export function Templates() {
  const navigate = useNavigate();

  const popularTemplates = [
    { title: "썰 쇼츠", color: "from-orange-400 to-red-500", image: "/썰쇼츠.png" },
    { title: "일반 쇼츠", color: "from-blue-400 to-indigo-500", image: "/일반쇼츠.png" },
    { title: "동물 AI 쇼츠", color: "from-emerald-400 to-green-500", image: "/동물쇼츠.png" },
  ];

  const templates = [
    { title: "브이로그 기본", color: "from-blue-400 to-cyan-500" },
    { title: "게임 하이라이트", color: "from-purple-500 to-pink-500" },
    { title: "뉴스 속보 스타일", color: "from-red-400 to-orange-500" },
    { title: "감성 인스타그램", color: "from-amber-400 to-yellow-500" },
    { title: "제품 리뷰", color: "from-emerald-400 to-green-500" },
    { title: "영화 예고편", color: "from-slate-400 to-zinc-500" },
  ];

  const handleSelectTemplate = (template: { title: string; image?: string; color: string }) => {
    sessionStorage.setItem("selectedTemplate", JSON.stringify({
      title: template.title,
      image: template.image || null,
      color: template.color,
    }));
    navigate("/editor");
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      {/* Popular Templates */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xl">🔥</span>
          <h2 className="text-xl font-bold text-gray-900">인기 템플릿</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {popularTemplates.map((t, idx) => (
            <div 
              key={idx} 
              className="group cursor-pointer"
              onClick={() => handleSelectTemplate(t)}
            >
              <div className="aspect-[3/4] rounded-2xl overflow-hidden mb-3 relative shadow-md hover:shadow-lg transition-shadow border border-gray-200 bg-gray-100">
                <img
                  src={t.image}
                  alt={t.title}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <span className="text-xs bg-orange-500 text-white px-2 py-1 rounded-full font-medium">
                    인기
                  </span>
                  <p className="font-bold text-white text-lg mt-2 drop-shadow-md">
                    {t.title}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* All Templates */}
      <div>
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xl">📋</span>
          <h2 className="text-xl font-bold text-gray-900">모든 템플릿</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((t, idx) => (
            <div 
              key={idx} 
              className="group cursor-pointer"
              onClick={() => handleSelectTemplate(t)}
            >
              <div
                className={`aspect-video rounded-2xl bg-gradient-to-br ${t.color} mb-3 relative overflow-hidden shadow-md hover:shadow-lg transition-all hover:scale-[1.02]`}
              >
                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                <div className="absolute bottom-4 left-4 font-bold text-white text-lg drop-shadow-md">
                  {t.title}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
