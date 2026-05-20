# Bar Exam Journal

변호사시험 학습 기록, 일정, 회독, 점수, 리포트를 관리하는 Vite/React 앱입니다.

## 실행

```bash
npm install
npm run dev
```

## Vercel 배포 환경변수

Vercel의 Project Settings > Environment Variables에 아래 값을 등록한 뒤 다시 배포합니다.

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

Firebase Authentication의 승인된 도메인에도 Vercel 배포 도메인을 추가해야 Google 로그인이 동작합니다.
