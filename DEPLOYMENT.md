# 배포 가이드

이 문서는 Avatar Bot 프로젝트를 배포하는 방법을 안내합니다.

## 사전 준비

1. **GitHub 계정 및 저장소**
   - GitHub에 코드를 푸시할 저장소가 필요합니다.

2. **OpenAI API 키**
   - [OpenAI Platform](https://platform.openai.com/api-keys)에서 API 키를 발급받으세요.
   - API 키는 배포 시 환경 변수로 설정해야 합니다.

## Vercel 배포 (권장)

### 1단계: GitHub에 코드 푸시

```bash
# Git 초기화 (아직 안 했다면)
git init

# 모든 파일 추가
git add .

# 커밋
git commit -m "Initial commit: Avatar Bot"

# GitHub 저장소 생성 후 연결
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# 메인 브랜치로 푸시
git branch -M main
git push -u origin main
```

### 2단계: Vercel에 프로젝트 연결

1. [Vercel](https://vercel.com)에 로그인 (GitHub 계정으로 로그인 권장)
2. 대시보드에서 **"Add New Project"** 클릭
3. GitHub 저장소 목록에서 프로젝트 선택
4. **"Import"** 클릭

### 3단계: 프로젝트 설정

1. **프레임워크 프리셋**: Next.js (자동 감지됨)
2. **루트 디렉토리**: `./` (기본값)
3. **빌드 설정**: 기본값 유지
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm install`

### 4단계: 환경 변수 설정

**중요**: 배포 전에 반드시 환경 변수를 설정해야 합니다.

1. 프로젝트 설정 페이지에서 **"Environment Variables"** 섹션으로 이동
2. 다음 환경 변수 추가:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: 발급받은 OpenAI API 키
   - **Environment**: Production, Preview, Development 모두 선택
3. **"Save"** 클릭

### 5단계: 배포

1. **"Deploy"** 버튼 클릭
2. 빌드가 완료될 때까지 대기 (약 2-3분)
3. 배포 완료 후 제공되는 URL로 접속하여 테스트

### 배포 후 확인사항

- ✅ 3D 아바타가 정상적으로 로드되는지 확인
- ✅ 음성 인식이 작동하는지 확인 (마이크 권한 허용 필요)
- ✅ AI 응답이 정상적으로 오는지 확인
- ✅ 오디오 재생이 되는지 확인

## 환경 변수 설정

### 로컬 개발

`.env.local` 파일을 프로젝트 루트에 생성:

```bash
OPENAI_API_KEY=sk-...
```

### Vercel 배포

Vercel 대시보드에서 환경 변수를 설정하거나, Vercel CLI 사용:

```bash
# Vercel CLI 설치
npm i -g vercel

# 로그인
vercel login

# 환경 변수 설정
vercel env add OPENAI_API_KEY
```

## 문제 해결

### 빌드 실패

- **오류**: "Module not found"
  - 해결: `package.json`의 모든 의존성이 설치되었는지 확인
  - `npm install` 재실행

- **오류**: "Environment variable not found"
  - 해결: Vercel 대시보드에서 환경 변수가 올바르게 설정되었는지 확인

### 런타임 오류

- **음성 인식이 작동하지 않음**
  - HTTPS 환경에서만 작동합니다 (Vercel은 자동으로 HTTPS 제공)
  - 브라우저가 Web Speech API를 지원하는지 확인

- **VRM 모델이 로드되지 않음**
  - `public/avatar.vrm` 파일이 저장소에 포함되어 있는지 확인
  - 파일 크기가 너무 크면 Vercel의 파일 크기 제한을 확인

## 추가 최적화

### 이미지 최적화

VRM 파일이 큰 경우, CDN을 사용하거나 압축을 고려하세요.

### 성능 모니터링

Vercel Analytics를 활성화하여 성능을 모니터링할 수 있습니다.

## 지원

문제가 발생하면 GitHub Issues에 문의하세요.

