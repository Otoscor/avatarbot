# Typecast TTS 설정 가이드

Typecast TTS를 AvatarBot에 통합하기 위한 단계별 가이드입니다.

## ✅ 완료된 작업

1. ✅ axios 패키지 설치
2. ✅ Typecast TTS API 통합 코드 작성
3. ✅ OpenAI 폴백 로직 구현

## 🔧 필요한 설정

### 1단계: Typecast 계정 및 API 키 준비

#### A. Typecast 가입
1. https://typecast.ai 접속
2. "무료로 시작하기" 클릭
3. Google/이메일/카카오 계정으로 가입

#### B. API 키 발급
1. 로그인 후 대시보드 이동
2. 좌측 메뉴 → **API** → **API Keys** 선택
3. "Create API Key" 클릭
4. API 키 이름 입력 (예: "AvatarBot_Production")
5. 권한: **Text-to-Speech** 선택
6. 생성된 API 키 복사 (⚠️ 한 번만 표시됨!)

#### C. 루피 보이스 선택
1. 대시보드 → **Voice Library** 이동
2. 필터 적용:
   - 언어: 한국어 (Korean)
   - 성별: 여성 (Female)
   - 톤: 밝은, 귀여운, 친근한
   - 카테고리: 애니메이션, 캐릭터
3. 여러 보이스 미리듣기
4. 루피에 맞는 보이스 선택
5. **Actor ID** 복사 (예: `actor_xxxxxxxxx`)

#### D. 서아 보이스 선택 (선택사항)
1. 동일한 방법으로 서아에 맞는 보이스 선택
2. 필터: 활발한, 친근한 여성 보이스
3. **Actor ID** 복사

### 2단계: 환경 변수 설정

`.env.local` 파일을 열고 다음 내용을 **추가**하세요:

```env
# Typecast TTS API
TYPECAST_API_KEY=tc_your_actual_api_key_here
TYPECAST_ACTOR_ID_LUPY=actor_your_lupy_voice_id_here
TYPECAST_ACTOR_ID_SEOA=actor_your_seoa_voice_id_here
```

⚠️ **중요**: 실제 API 키와 Actor ID로 교체하세요!

### 3단계: 개발 서버 재시작

```bash
# 기존 서버 종료 (Ctrl + C)
# 새로 시작
npm run dev
```

### 4단계: 테스트

1. 브라우저에서 앱 열기
2. 루피와 대화 시작
3. F12를 눌러 콘솔 확인
4. 다음 로그 확인:
   ```
   === TTS 생성 시작 ===
   TTS 엔진: Typecast
   ✅ Typecast TTS 생성 성공!
   ```

## 🎯 TTS 엔진 선택 로직

### Typecast TTS 사용 조건
다음 **모두** 충족 시 Typecast 사용:
- ✅ `TYPECAST_API_KEY` 설정됨
- ✅ 캐릭터의 `TYPECAST_ACTOR_ID` 설정됨

### OpenAI TTS 폴백
다음 경우 OpenAI TTS 사용:
- ❌ Typecast 환경변수 미설정
- ❌ Typecast API 호출 실패
- ❌ Typecast 크레딧 부족

## 🎨 캐릭터별 최적 설정

### 루피 (jinyoung)
```typescript
{
  tempo: 1.05,      // 약간 빠르게 (활발한 느낌)
  pitch: 1,         // 약간 높은 톤 (귀여운 느낌)
  emotion: "happy", // 기본 감정
  emotion_strength: 0.7
}
```

### 서아 (test)
```typescript
{
  tempo: 1.0,       // 보통 속도
  pitch: 0,         // 보통 톤
  emotion: "happy", // 기본 감정
  emotion_strength: 0.7
}
```

## 🔍 문제 해결

### 1. "❌ TTS 생성 오류" 발생 시

#### 원인 1: API 키 오류
```bash
# .env.local 확인
cat .env.local | grep TYPECAST
```
- API 키가 `tc_`로 시작하는지 확인
- 공백이나 줄바꿈이 없는지 확인

#### 원인 2: Actor ID 오류
- Typecast 웹사이트에서 Actor ID 재확인
- 정확히 복사했는지 확인

#### 원인 3: 크레딧 부족
- Typecast 대시보드 → Usage 확인
- 크레딧 충전 필요

### 2. "OpenAI TTS로 폴백" 로그가 계속 나올 때
- Typecast 환경변수가 올바르게 설정되지 않은 것
- `.env.local` 파일 재확인
- 서버 재시작 확인

### 3. 음성이 재생되지 않을 때
- 브라우저 콘솔에서 오류 확인
- "✅ TTS 생성 성공" 로그가 있는지 확인
- 오디오 데이터 길이가 0보다 큰지 확인

## 📊 비용 관리

### Typecast 크레딧 사용량
- 짧은 응답 (10-30자): ~1-3 크레딧
- 중간 응답 (30-100자): ~3-10 크레딧
- 긴 응답 (100-200자): ~10-20 크레딧

### 비용 절약 팁
1. **루피만 Typecast 사용**: 서아는 OpenAI TTS 유지
   ```env
   # 서아용 Actor ID 주석처리 또는 제거
   # TYPECAST_ACTOR_ID_SEOA=
   ```

2. **개발 중 OpenAI 사용**: Typecast 환경변수 주석처리
   ```env
   # TYPECAST_API_KEY=...
   # TYPECAST_ACTOR_ID_LUPY=...
   ```

3. **크레딧 모니터링**: Typecast 대시보드 정기적 확인

## 🚀 배포 (Vercel)

Vercel에 배포 시 환경변수 추가:

1. Vercel 대시보드 → 프로젝트 선택
2. Settings → Environment Variables
3. 다음 변수 추가:
   - `TYPECAST_API_KEY`
   - `TYPECAST_ACTOR_ID_LUPY`
   - `TYPECAST_ACTOR_ID_SEOA` (선택사항)
4. 재배포

## 📝 체크리스트

설정 완료 전 확인:
- [ ] Typecast 계정 생성
- [ ] API 키 발급 및 저장
- [ ] 루피 보이스 선택 (Actor ID 복사)
- [ ] `.env.local`에 환경변수 추가
- [ ] 개발 서버 재시작
- [ ] 루피와 대화 테스트
- [ ] 콘솔에서 "Typecast TTS 생성 성공" 확인
- [ ] 음성 재생 확인

## 🎉 완료!

설정이 완료되면 루피가 훨씬 더 자연스럽고 귀여운 한국어로 말하게 됩니다!

문제가 발생하면 콘솔 로그를 확인하고, 필요시 OpenAI TTS로 자동 폴백됩니다.
