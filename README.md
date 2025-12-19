# Avatar Bot

3D 가상 아이돌과 음성으로 대화할 수 있는 인터랙티브 웹 애플리케이션입니다.

## 주요 기능

- 🎭 3D VRM 아바타 렌더링
- 🎤 실시간 음성 인식 (Speech-to-Text)
- 💬 AI 챗봇 (OpenAI GPT-4o-mini)
- 🔊 음성 합성 (TTS)
- 😊 감정 표현 및 립싱크
- 👁️ 시선 추적 및 자동 눈 깜빡임
- 🎨 핸즈프리 모드 (Replika 스타일)

## 기술 스택

- **Framework**: Next.js 16 (App Router)
- **3D**: Three.js, @react-three/fiber, @react-three/drei
- **VRM**: @pixiv/three-vrm
- **State Management**: Zustand
- **AI**: OpenAI API (GPT-4o-mini, TTS-1)
- **Styling**: Tailwind CSS
- **Font**: Pretendard

## 시작하기

### 1. 저장소 클론 및 의존성 설치

```bash
git clone <repository-url>
cd avatarbot
npm install
```

### 2. 환경 변수 설정

`.env.local` 파일을 생성하고 다음 내용을 추가하세요:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

OpenAI API 키는 [OpenAI Platform](https://platform.openai.com/api-keys)에서 발급받을 수 있습니다.

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

## 배포하기

### Vercel에 배포 (권장)

1. **GitHub에 코드 푸시**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Vercel에 프로젝트 연결**
   - [Vercel](https://vercel.com)에 로그인
   - "Add New Project" 클릭
   - GitHub 저장소 선택
   - 프로젝트 import

3. **환경 변수 설정**
   - Vercel 대시보드에서 프로젝트 설정으로 이동
   - "Environment Variables" 섹션에서 `OPENAI_API_KEY` 추가
   - 값 입력 후 "Save" 클릭

4. **배포**
   - "Deploy" 버튼 클릭
   - 배포 완료 후 제공되는 URL로 접속

### 수동 배포

```bash
# 프로덕션 빌드
npm run build

# 프로덕션 서버 실행
npm start
```

## 프로젝트 구조

```
avatarbot/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── chat/          # OpenAI API 라우트
│   │   ├── layout.tsx         # 루트 레이아웃
│   │   └── page.tsx           # 메인 페이지
│   ├── components/
│   │   ├── Avatar.tsx         # 3D 아바타 컴포넌트
│   │   ├── AvatarCanvas.tsx   # Three.js 캔버스
│   │   ├── ChatInterface.tsx  # 채팅 UI
│   │   └── FontLoader.tsx     # 폰트 로더
│   └── store/
│       └── useChatStore.ts    # Zustand 스토어
├── public/
│   └── avatar.vrm             # VRM 모델 파일
└── package.json
```

## 주의사항

- **VRM 모델**: `public/avatar.vrm` 파일이 필요합니다. 자신의 VRM 모델로 교체할 수 있습니다.
- **API 키 보안**: 환경 변수는 절대 공개 저장소에 커밋하지 마세요.
- **브라우저 호환성**: Web Speech API를 사용하므로 Chrome, Edge 등 Chromium 기반 브라우저에서 최적의 성능을 제공합니다.

## 라이선스

이 프로젝트는 개인 사용 목적으로 제작되었습니다.
