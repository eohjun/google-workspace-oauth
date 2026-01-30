# Google Calendar OAuth Service

Google Workspace와 연동을 위한 OAuth 서비스입니다.

## 기능

- Google OAuth 2.0 인증
- Google Calendar 이벤트 조회/생성/수정/삭제
- 이벤트 타입별 자동 색상 적용
- RESTful API 제공

## 이벤트 색상 매핑

| 타입 | 색상 | Color ID |
|------|------|----------|
| 자기계발 | 초록 | 2 |
| 개인 | 파랑 | 1 |
| 업무 | 주황 | 6 |
| 가족 | 노랑 | 5 |

## API 엔드포인트

### 인증
- `GET /auth` - OAuth 플로우 시작 (Google 로그인 페이지로 리다이렉트)
- `GET /callback` - OAuth 콜백 처리
- `GET /status` - 인증 상태 확인

### 캘린더 이벤트
- `GET /events` - 향후 이벤트 조회 (최대 10개)
- `POST /events` - 새 이벤트 생성
- `PUT /events/:eventId` - 이벤트 수정
- `DELETE /events/:eventId` - 이벤트 삭제

### 헬스체크
- `GET /` - 서비스 상태 확인

## 사용법

### 1. 첫 인증
```
GET https://your-service.railway.app/auth
```
브라우저에서 위 URL 방문 → Google 로그인 → 권한 승인

### 2. 이벤트 조회
```bash
curl https://your-service.railway.app/events
```

### 3. 이벤트 생성
```bash
curl -X POST https://your-service.railway.app/events \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "식사",
    "start": "2024-01-30T18:00:00+09:00",
    "end": "2024-01-30T20:00:00+09:00",
    "description": "가족과 저녁 식사",
    "type": "가족"
  }'
```

이벤트 생성 시 `type` 필드를 포함하면 자동으로 색상이 적용됩니다:
- `"type": "자기계발"` → 초록색
- `"type": "개인"` → 파랑색
- `"type": "업무"` → 주황색
- `"type": "가족"` → 노랑색

### 4. 알람 설정
기본 알람(30분 전)은 유지되며, 필요한 경우 추가 알람을 설정할 수 있습니다:

```bash
curl -X POST https://your-service.railway.app/events \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "중요한 미팅",
    "start": "2024-02-05T10:00:00+09:00",
    "end": "2024-02-05T12:00:00+09:00",
    "type": "업무",
    "reminders": [
      {"method": "popup", "minutes": 1440},
      {"method": "popup", "minutes": 60}
    ]
  }'
```

- `minutes: 1440` = 하루 전
- `minutes: 60` = 1시간 전
- `method`: `popup` (알림) 또는 `email` (이메일)

## 환경변수

Railway Variables에서 설정:
- `GOOGLE_CLIENT_ID`: Google OAuth 클라이언트 ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth 클라이언트 시크릿
- `REDIRECT_URI`: `https://your-service.railway.app/callback`

## 개발

```bash
npm install
npm run dev
```

## 배포

Railway에 연결하여 자동 배포됩니다.
