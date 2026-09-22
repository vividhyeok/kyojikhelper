# Kyojik Helper

교수 발화를 요약하는 앱이 아니라, 교수의 설명 동작과 개념 관계를 학습자의 이해 문법으로 치환하는 Android-first 실시간 Cognitive Translator입니다. 관계를 알 수 없으면 인과를 만들어내지 않고 다음에 들어야 할 점을 알려줍니다. 음성은 저장하지 않으며 확정 전사, 이해 이벤트, 강의 상태와 복습 노트만 브라우저 IndexedDB에 보관합니다.

## 주요 기능

- OpenAI Realtime GA + WebRTC 기반 `gpt-live-transcribe` 실시간 전사
- 고정 polling이 아닌 final utterance 기반 adaptive scheduler
- 최근 500~1,500자 + 압축 lecture state만 사용하는 비용 제한 분석
- 정의·비교·사례·역사적 전환·복귀·불명확한 관계를 구분하는 Understanding Frame HUD
- 필요한 때만 누락된 한 단계를 보충하고, 교수 의견과 학술 배경·AI 추론을 분리
- `놓침`, `왜?`, 카드 최소 읽기 시간, 중요도 queue, 의미 중복 억제
- PIN + 서명된 HttpOnly/Secure/SameSite 세션 쿠키
- IndexedDB 로컬 저장, 진행 중 수업 복구, History, Markdown/TXT/JSON export
- 화면 Wake Lock, WebRTC 지수 backoff 재연결, 중복 segment 방지
- 길이에 따라 단일/분할 압축을 선택하는 최종 복습 노트
- 설치형 PWA 및 offline app shell/history 접근

## Local

```bash
git clone https://github.com/vividhyeok/kyojikhelper.git
cd kyojikhelper
npm install
cp .env.example .env.local
npm run dev
```

Windows PowerShell에서는 `Copy-Item .env.example .env.local`을 사용할 수 있습니다. `.env.local` 값을 채우고 `http://localhost:3000`을 엽니다. 개발 환경에서 시작 화면의 `Mock 강의 실행`으로 OpenAI 비용 없이 UI와 scheduler 흐름을 확인할 수 있습니다.

개발용 `/lab`에서는 긴 강의 발화를 줄 단위로 붙여넣고 Mock 또는 실제 OpenAI 분석을 한 발화씩 재생할 수 있습니다. Mock은 비용이 들지 않습니다. 실제 API 버튼은 PIN 로그인과 유효한 API 설정이 필요하며 호출 비용이 발생합니다. `/lab`은 production에서 404입니다.

서버가 실행 중일 때 `npm run eval:openai`로 사례·비교·불명확 전환 3건의 실제 모델 평가를 선택적으로 실행할 수 있습니다. 이 명령은 OpenAI 사용 요금이 발생하며 기본 테스트에는 포함되지 않습니다.

## Environment Variables

| 이름                      | 필수 | 설명                                                                       |
| ------------------------- | ---: | -------------------------------------------------------------------------- |
| `OPENAI_API_KEY`          |   예 | 서버에서만 사용하는 OpenAI API key. 절대로 `NEXT_PUBLIC_`로 만들지 마세요. |
| `OPENAI_BASE_URL`         |   예 | 기본값 `https://api.openai.com/v1`                                         |
| `OPENAI_TRANSCRIBE_MODEL` |   예 | 기본값 `gpt-live-transcribe`                                               |
| `OPENAI_ANALYSIS_MODEL`   |   예 | 실시간 이해 분석 모델, 기본값 `gpt-5.6-luna`                               |
| `OPENAI_SUMMARY_MODEL`    |   예 | 종료 후 복습 노트 모델, 기본값 `gpt-5.6-luna`                              |
| `APP_ACCESS_PIN`          |   예 | 개인 앱 접근 PIN. 긴 임의 PIN 권장                                         |
| `SESSION_SECRET`          |   예 | 쿠키 서명용 충분히 긴 무작위 문자열(최소 32자 권장)                        |

실제 secret은 `.env.example`이나 Git에 넣지 마세요. `.env.local`은 Git에서 제외됩니다.

## Vercel 배포

1. Vercel에서 이 GitHub 저장소를 **Import**합니다.
2. Framework는 Next.js로 자동 감지되는 값을 유지합니다.
3. **Settings → Environment Variables**에서 위 7개 변수를 Production(필요하면 Preview에도) 등록합니다.
4. Deploy를 실행합니다.
5. Android Chrome에서 HTTPS URL을 열고 메뉴의 **Add to Home Screen / Install App**을 선택합니다.
6. 앱을 실행해 `APP_ACCESS_PIN`을 입력합니다.
7. 수업명을 입력하고 `수업 시작`을 누른 뒤 마이크 권한을 허용합니다.

Wake Lock과 마이크는 보안 컨텍스트(HTTPS 또는 localhost)에서 동작합니다. Android가 앱을 background로 보내거나 절전 정책으로 중단하면 실시간 전사가 잠시 멈출 수 있으며, foreground 복귀 시 Wake Lock과 Realtime 연결을 다시 확보합니다.

## API architecture

```text
Android Chrome / PWA
  ├─ POST /api/realtime-token (HttpOnly session 필요)
  │    └─ Vercel 서버가 OPENAI_API_KEY로 짧은 수명의 client secret 발급
  ├─ ephemeral secret으로 OpenAI Realtime GA에 WebRTC 직접 연결
  ├─ final transcript → adaptive scheduler → POST /api/analyze
  └─ 종료 → POST /api/finalize
```

일반 OpenAI API key는 브라우저 bundle, localStorage, IndexedDB에 들어가지 않습니다. `/api/realtime-token`, `/api/analyze`, `/api/finalize`는 인증되지 않은 요청을 거부합니다. API route는 입력 검증, 크기 제한, timeout, 비민감 오류 응답을 적용합니다.

## 데이터와 개인정보

- 마이크 audio blob이나 녹음 파일은 저장하지 않습니다.
- 확정 transcript와 AI 결과는 현재 브라우저 IndexedDB에만 저장합니다.
- STT와 이해 분석에 필요한 데이터만 OpenAI로 전송합니다.
- Settings의 `전체 기록 삭제` 또는 수업 상세의 삭제로 로컬 데이터를 제거할 수 있습니다.
- Service Worker는 `/api/*`와 OpenAI 요청을 cache하거나 가로채지 않습니다.

## 검증

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

테스트는 adaptive batching, state reducer, duplicate suppression, 카드 우선순위, Markdown export를 포함합니다.
