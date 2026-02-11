# ShortMagician

AI 기반 숏폼 동영상(쇼츠) 제작 데스크톱 애플리케이션.

React + Vite + Tauri 2 데스크톱 앱, FastAPI 백엔드, Firebase(Firestore·Auth), 반응형(모바일 웹뷰 대비) 구성.

## 주요 기능

- **프로젝트 관리** - 쇼츠 프로젝트 생성, 검색, 관리
- **쇼츠 에디터** - 컷 편집, 장면 추가, 요소 삽입, 타임라인 편집
- **템플릿** - 브이로그, 게임 하이라이트, 뉴스, 감성, 리뷰, 영화 예고편 등 다양한 템플릿 제공
- **미디어 업로드** - 드래그 앤 드롭 방식의 미디어 파일 업로드
- **Firebase 인증** - 로그인/회원가입 및 Bearer 토큰 기반 API 인증

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | React 18, TypeScript, Vite 7, TailwindCSS 4 |
| Desktop | Tauri 2 (Rust) |
| Backend | FastAPI (Python 3.10+) |
| Auth | Firebase Authentication |
| Database | Firebase Firestore |
| Icons | Lucide React |

## 선행 조건

- **Node.js** 18+
- **Yarn**
- **Rust** ([Tauri 사전 요구사항](https://tauri.app/start/prerequisites))
- **Python** 3.10+
- **Firebase 프로젝트** (Firestore·Authentication 활성화, 웹 앱 등록)

## 설정

### 1. 환경 변수

```bash
# 프론트엔드 (루트)
cp .env.example .env
```

`.env` 파일 설정:

```env
# Firebase (Firebase Console > Project settings > Your apps > Web app)
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# FastAPI backend URL
VITE_API_URL=http://localhost:8000
```

```bash
# 백엔드
cp backend/.env.example backend/.env
```

`backend/.env` 파일 설정:

```env
HOST=0.0.0.0
PORT=8000

# Optional: Firebase Admin (ID 토큰 검증용)
# GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json
# FIREBASE_PROJECT_ID=your_project_id
```

### 2. 의존성 설치

```bash
# 프론트엔드
yarn install

# 백엔드
cd backend && pip install -r requirements.txt
```

## 실행

| 대상 | 명령 |
|------|------|
| Tauri 데스크톱 개발 | `yarn tauri dev` |
| 웹만 개발 (Vite) | `yarn dev` |
| Tauri 프로덕션 빌드 | `yarn tauri build` |
| FastAPI 개발 | `cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` |

## 프로젝트 구조

```
shortmagician/
├── src/                          # React 프론트엔드
│   ├── components/
│   │   └── shorts/               # 쇼츠 에디터 컴포넌트
│   │       ├── ShortsTopbar.tsx      # 상단 툴바
│   │       ├── ShortsLeftPanel.tsx   # 좌측 프리뷰 패널
│   │       ├── ShortsCenterPanel.tsx # 중앙 편집 영역
│   │       └── ShortsRightPanel.tsx  # 우측 속성 패널
│   ├── layouts/
│   │   └── DashboardLayout.tsx   # 대시보드 레이아웃
│   ├── lib/
│   │   ├── api.ts                # FastAPI HTTP 클라이언트
│   │   └── firebase.ts           # Firebase 초기화
│   ├── pages/
│   │   ├── Home.tsx              # 홈 (프로젝트 목록)
│   │   ├── ShortsEditor.tsx      # 쇼츠 에디터
│   │   ├── Templates.tsx         # 템플릿
│   │   ├── Upload.tsx            # 업로드
│   │   └── Settings.tsx          # 설정
│   ├── App.tsx                   # 라우터 설정
│   └── main.tsx                  # 엔트리 포인트
├── src-tauri/                    # Tauri 2 (Rust)
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs
│   ├── tauri.conf.json           # Tauri 설정
│   └── Cargo.toml
├── backend/                      # FastAPI 백엔드
│   ├── app/
│   │   ├── main.py               # FastAPI 앱
│   │   ├── config.py             # 환경 설정
│   │   └── routers/
│   │       └── example.py        # 예시 라우터
│   └── requirements.txt
├── .env.example
└── package.json
```

## 프론트엔드 라우트

| 경로 | 페이지 | 설명 |
|------|--------|------|
| `/` | Home | 프로젝트 목록 및 새 프로젝트 생성 |
| `/editor` | ShortsEditor | 풀스크린 쇼츠 편집기 |
| `/templates` | Templates | 템플릿 갤러리 |
| `/upload` | Upload | 미디어 파일 업로드 |
| `/settings` | Settings | 계정, 앱 설정, 지원 |

---

## API 문서

### Base URL

- 개발: `http://localhost:8000`
- CORS 허용 origin:
  - `http://localhost:5173` (Vite dev)
  - `http://localhost:1420` (Tauri dev)
  - `tauri://localhost`

### 인증

Firebase ID Token을 Bearer 토큰으로 전달:

```http
Authorization: Bearer <firebase_id_token>
```

프론트엔드에서는 `src/lib/api.ts`의 Axios 인터셉터가 자동으로 토큰을 추가합니다.

---

### 엔드포인트

#### 시스템

##### `GET /`

상태 확인

**Response**

```json
{
  "status": "ok"
}
```

---

##### `GET /health`

헬스 체크

**Response**

```json
{
  "status": "healthy"
}
```

---

#### Example API (`/api/v1`)

##### `GET /api/v1/hello`

예시 인사 메시지

**Response**

```json
{
  "message": "Hello from FastAPI"
}
```

---

### 에러 응답

FastAPI 표준 에러 형식을 따릅니다:

```json
{
  "detail": "에러 메시지"
}
```

| 상태 코드 | 설명 |
|-----------|------|
| 400 | Bad Request - 잘못된 요청 |
| 401 | Unauthorized - 인증 필요 |
| 403 | Forbidden - 권한 없음 |
| 404 | Not Found - 리소스 없음 |
| 422 | Unprocessable Entity - 유효성 검증 실패 |
| 500 | Internal Server Error - 서버 오류 |

---

### API 사용 예시 (프론트엔드)

```typescript
import { api } from "./lib/api";

// GET 요청
const response = await api.get("/api/v1/hello");
console.log(response.data.message);

// 인증된 사용자의 경우 자동으로 Bearer 토큰이 추가됩니다
```

---

## 모바일 웹뷰

`yarn build`로 생성한 `dist/`를 모바일 WebView에 로드해 사용 가능.

- `viewport` 메타와 Tailwind 반응형으로 모바일 대응
- Capacitor 등으로 래핑해도 동일 빌드 사용 가능

## 라이선스

Private
