import { useState } from "react";
import { Bell, User, Lock, Monitor, HelpCircle, ChevronRight, Youtube, Plus, Trash2 } from "lucide-react";

// 연결된 YouTube 채널 더미 데이터
const connectedChannels = [
  {
    id: "1",
    name: "6090건강",
    language: "ko",
    flag: "🇰🇷",
    subscribers: "1만",
    profileImage: "https://ui-avatars.com/api/?name=6090&background=ff0000&color=fff&size=64",
  },
  {
    id: "3",
    name: "6090健康",
    language: "ja",
    flag: "🇯🇵",
    subscribers: "5.6천",
    profileImage: "https://ui-avatars.com/api/?name=6090&background=ff0000&color=fff&size=64",
  },
];

const languageNames: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
  es: "Español",
};

export function Settings() {
  const [channels, setChannels] = useState(connectedChannels);

  const handleDisconnect = (channelId: string) => {
    // 실제 기능 없음 - UI 데모용
    setChannels(channels.filter(c => c.id !== channelId));
  };

  const handleConnect = () => {
    // 실제 기능 없음 - UI 데모용
    alert("YouTube 계정 연결 기능은 아직 준비 중입니다.");
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-8">설정</h2>

      <div className="space-y-6">
        {/* YouTube 계정 연결 섹션 */}
        <Section title="YouTube 계정 연결">
          <div className="p-4 space-y-4">
            {/* 연결된 채널 목록 */}
            {channels.length > 0 ? (
              <div className="space-y-3">
                {channels.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-lg overflow-hidden">
                          <img 
                            src={channel.profileImage} 
                            alt={channel.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm">
                          <Youtube size={12} className="text-red-500" />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{channel.name}</span>
                          <span className="text-sm">{channel.flag}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{languageNames[channel.language]}</span>
                          <span>•</span>
                          <span>구독자 {channel.subscribers}</span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDisconnect(channel.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="연결 해제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <Youtube size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm">연결된 YouTube 채널이 없습니다</p>
              </div>
            )}

            {/* 새 채널 연결 버튼 */}
            <button
              onClick={handleConnect}
              className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:text-red-500 hover:border-red-300 hover:bg-red-50 transition-all"
            >
              <Plus size={20} />
              <span className="font-medium">새 YouTube 채널 연결</span>
            </button>
          </div>
        </Section>

        <Section title="계정 설정">
          <SettingRow icon={<User size={18} />} label="프로필 수정" />
          <SettingRow icon={<Lock size={18} />} label="비밀번호 변경" />
        </Section>

        <Section title="앱 설정">
          <SettingRow icon={<Bell size={18} />} label="알림 설정" />
          <SettingRow
            icon={<Monitor size={18} />}
            label="테마 설정"
            value="라이트 모드"
          />
        </Section>

        <Section title="지원">
          <SettingRow icon={<HelpCircle size={18} />} label="도움말 및 지원" />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-semibold text-gray-500">{title}</span>
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

function SettingRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) {
  return (
    <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors text-left">
      <div className="flex items-center gap-3 text-gray-700">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {value && <span className="text-xs text-gray-500">{value}</span>}
        <ChevronRight size={16} className="text-gray-400" />
      </div>
    </button>
  );
}
