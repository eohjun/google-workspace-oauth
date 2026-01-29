Google Calendar OAuth Service
Moltbot과 Google Calendar 연동을 위한 OAuth 서비스입니다.

기능
Google OAuth 2.0 인증
Google Calendar 이벤트 조회/생성/수정/삭제
RESTful API 제공
API 엔드포인트
인증
GET /auth - OAuth 플로우 시작 (Google 로그인 페이지로 리다이렉트)
GET /callback - OAuth 콜백 처리
GET /status - 인증 상태 확인
캘린더 이벤트
GET /events - 향후 이벤트 조회 (최대 10개)
POST /events - 새 이벤트 생성
PUT /events/:eventId - 이벤트 수정
DELETE /events/:eventId - 이벤트 삭제
헬스체크
GET / - 서비스 상태 확인
사용법
1. 첫 인증
GET https://your-service.railway.app/auth
브라우저에서 위 URL 방문 → Google 로그인 → 권한 승인

2. 이벤트 조회
curl https://your-service.railway.app/events
3. 이벤트 생성
curl -X POST https://your-service.railway.app/events \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "회의",
    "start": "2024-01-30T14:00:00+09:00",
    "end": "2024-01-30T15:00:00+09:00",
    "description": "중요한 회의"
  }'
환경변수
Railway Variables에서 설정:

GOOGLE_CLIENT_ID: Google OAuth 클라이언트 ID
GOOGLE_CLIENT_SECRET: Google OAuth 클라이언트 시크릿
REDIRECT_URI: https://your-service.railway.app/callback
개발
npm install
npm run dev
배포
Railway에 연결하여 자동 배포됩니다.
