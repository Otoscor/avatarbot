# API 문서

이 문서는 AvatarBot 프로젝트에서 사용하는 모든 API를 정리한 것입니다.

## 📋 목차
1. [외부 API](#외부-api)
2. [내부 API](#내부-api)
3. [브라우저 API](#브라우저-api)

---

## 🌐 외부 API

### 1. OpenAI API

#### 1.1 Chat Completions API (GPT-4o-mini)
- **용도**: AI 캐릭터 대화 응답 생성
- **모델**: `gpt-4o-mini`
- **엔드포인트**: `openai.chat.completions.create()`
- **설정**:
  - `temperature`: 0.7 (창의성과 일관성의 균형)
  - `response_format`: JSON 객체 (구조화된 응답)
- **요청 형식**:
  ```typescript
  {
    messages: [
      { role: "system", content: "캐릭터 페르소나" },
      { role: "user", content: "사용자 메시지" },
      ...
    ],
    character: "jinyoung" | "test"
  }
  ```
- **응답 형식**:
  ```typescript
  {
    text: string,      // 캐릭터 응답 텍스트
    emotion: "happy" | "sad" | "angry" | "neutral" | "surprised"
  }
  ```
- **API 키**: 환경변수 `OPENAI_API_KEY` 필요
- **파일 위치**: `src/app/api/chat/route.ts`

#### 1.2 Text-to-Speech API (TTS)
- **용도**: 텍스트를 음성으로 변환
- **모델**: `tts-1-hd` (고품질)
- **엔드포인트**: `openai.audio.speech.create()`
- **설정**:
  - `speed`: 1.0 (자연스러운 속도)
  - `voice`: 캐릭터별 음성 매핑
    - 서아 (test): `nova` - 밝고 명랑한 목소리
    - 루피 (jinyoung): `shimmer` - 부드럽고 상냥한 목소리
- **응답**: Base64 인코딩된 MP3 오디오 데이터
- **파일 위치**: `src/app/api/chat/route.ts`

---

## 🏠 내부 API

### POST /api/chat
- **용도**: 사용자 메시지를 받아 AI 응답 생성 (텍스트 + 감정 + 음성)
- **메서드**: POST
- **요청 본문**:
  ```typescript
  {
    messages: Array<{
      role: "user" | "assistant",
      content: string
    }>,
    character: "jinyoung" | "test"  // 선택된 캐릭터
  }
  ```
- **응답**:
  ```typescript
  {
    text: string,           // AI 응답 텍스트
    emotion: string,        // 감정 (happy/sad/angry/neutral/surprised)
    audio: string          // Base64 인코딩된 음성 데이터
  }
  ```
- **파일 위치**: `src/app/api/chat/route.ts`
- **처리 과정**:
  1. 캐릭터별 페르소나 시스템 메시지 추가
  2. OpenAI GPT-4o-mini로 텍스트 응답 생성
  3. OpenAI TTS로 음성 생성
  4. JSON 응답 반환

---

## 🌍 브라우저 API

### 1. Web Speech API (Speech Recognition)
- **용도**: 사용자 음성을 텍스트로 변환 (STT - Speech-to-Text)
- **브라우저 지원**: Chrome, Edge 등 (Safari 제한적)
- **설정**:
  ```typescript
  {
    continuous: true,        // 지속적 인식
    interimResults: true,   // 중간 결과 반환
    lang: "ko-KR"           // 한국어 인식
  }
  ```
- **사용 위치**: `src/components/ChatInterface.tsx`
- **특징**:
  - 실시간 음성 인식
  - 1.5초 침묵 감지 후 자동 전송
  - 브라우저 마이크 권한 필요

### 2. Web Audio API
- **용도**: 오디오 재생 및 분석 (립싱크)
- **주요 기능**:
  - `AudioContext`: 오디오 처리 컨텍스트
  - `AnalyserNode`: 오디오 주파수 분석 (립싱크용)
  - `GainNode`: 볼륨 제어
- **사용 위치**: `src/components/Avatar.tsx`
- **처리 과정**:
  1. Base64 오디오를 Audio 객체로 변환
  2. AnalyserNode로 실시간 음량 분석
  3. 음량에 따라 아바타 입 모양 조절

---

## 📦 주요 라이브러리

### Three.js / React Three Fiber
- **용도**: 3D 아바타 렌더링
- **버전**: Three.js ^0.182.0, R3F ^9.4.2
- **파일 위치**: `src/components/Avatar.tsx`, `src/components/AvatarCanvas.tsx`
- **기능**:
  - VRM 모델 로드 및 렌더링 (서아)
  - GLB 모델 로드 및 애니메이션 (루피)
  - 블렌드쉐이프 애니메이션 (표정, 립싱크)

### Zustand
- **용도**: 전역 상태 관리
- **파일 위치**: `src/store/useChatStore.ts`
- **관리 상태**:
  - 채팅 메시지 목록
  - 로딩 상태
  - 현재 감정
  - 오디오 데이터
  - 선택된 캐릭터

---

## 🔐 환경 변수

프로젝트 실행을 위해 필요한 환경 변수:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

`.env.local` 파일에 설정하거나 배포 플랫폼(Vercel 등)의 환경 변수에 추가해야 합니다.

---

## 🔄 API 호출 흐름

### 음성 대화 흐름
```
1. 사용자 음성 입력
   ↓
2. Web Speech API (STT)
   ↓ (텍스트 변환)
3. POST /api/chat
   ↓
4. OpenAI GPT-4o-mini (텍스트 응답 생성)
   ↓
5. OpenAI TTS (음성 생성)
   ↓
6. 클라이언트 응답 수신
   ↓
7. Web Audio API (오디오 재생 + 립싱크)
```

### 텍스트 채팅 흐름
```
1. 사용자 텍스트 입력
   ↓
2. POST /api/chat
   ↓
3. OpenAI GPT-4o-mini (응답 생성)
   ↓
4. OpenAI TTS (음성 생성)
   ↓
5. 클라이언트 응답 수신 및 표시
```

---

## 📊 API 사용량 및 비용

### OpenAI API 사용량
- **GPT-4o-mini**: 요청당 토큰 기반 과금
  - 입력: ~$0.00015/1K tokens
  - 출력: ~$0.0006/1K tokens
  
- **TTS (tts-1-hd)**: 문자당 과금
  - ~$0.030/1K characters

### 최적화 팁
- 시스템 메시지를 간결하게 유지
- 대화 히스토리 제한 (필요시 최근 N개만 전송)
- TTS 캐싱 고려 (동일한 응답 재사용)

---

## 🐛 디버깅

각 API 호출 시 상세 로그가 콘솔에 출력됩니다:
- ✅ 성공 로그
- ❌ 실패 로그
- 📊 데이터 크기 및 상태 정보

브라우저 개발자 도구(F12)의 콘솔 탭에서 확인 가능합니다.

---

## 📝 참고 문서

- [OpenAI API 문서](https://platform.openai.com/docs/api-reference)
- [Web Speech API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [Web Audio API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Three.js 문서](https://threejs.org/docs/)
- [VRM 스펙](https://vrm.dev/en/)
