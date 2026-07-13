# WebRTC\_일대일 화상 채팅 과외\_팀과제

WebRTC와 Socket.IO를 활용해 선생님과 학생을 실시간으로 연결하는 1:1 화상 과외 플랫폼입니다. 회원가입/로그인부터 로비에서의 실시간 채팅, 과목·수준별 과외방 개설, 1:1 화상 채팅와 화면 공유까지 지원합니다.

## 1. 프로젝트 실행

```bash
npm install     # 설치
# 환경 변수 설정
npm run dev     # node app.mjs
```

### 환경 변수 설정

```env
JWT_SECRET="..."
JWT_EXPIRES_SEC="..."
BCRYPT_SALT_ROUNDS="..."
HOST_PORT="..."
MONGODB_URI="..."
```

> 프로젝트 루트에 `.env` 파일을 생성하고 아래 값을 설정합니다.<br>`.env` 파일에 인라인 주석(`KEY=value # comment`)을 넣으면 파싱 오류가 발생할 수 있으니 값만 정확히 입력하세요.

서버 실행 후 `http://localhost:HOST_PORT`에서 접속

## 2. 팀명 및 팀원

### TEAM_DAGACHI

| 이름                 | 역할                 |
| -------------------- | -------------------- |
| 길준영, 한혜원(팀장) | 메인 로비            |
| 김동권, 배성욱       | 화상채팅방           |
| 오승아, 이서진       | 로그인/회원가입, PPT |

## 3. 주요 기능

### 인증

- 회원가입 (아이디 중복 확인, bcrypt 비밀번호 해싱)
- 로그인 (JWT 토큰 발급)
- 로그인 유지 (`isAuth` 미들웨어를 통한 토큰 검증)
- 로그인 성공 시 사용자 유형(선생님/학생)에 따라 각기 다른 로비로 자동 이동

### 로비 (선생님 / 학생)

- Socket.IO 기반 실시간 채팅 (전체 채팅 및 귓속말)
- 과목별(국어/영어/수학/사회/과학) 채널 전환
- 접속 중인 선생님·학생 인원 수 및 목록 실시간 표시
- 과외방 목록 조회, 과목·수준 필터링
- 선생님: 과외방 개설(제목/과목/난이도 설정)
- 학생: 개설된 과외방에 입장

### 1:1 화상 과외 (WebRTC)

- 실시간 영상/음성 통화 (STUN 서버 기반 P2P 연결)
- 마이크·스피커 장치 선택 및 음량 조절
- 마이크 음소거 / 상대방 음소거
- 카메라 On/Off, 전/후면 카메라 전환
- 화면 공유 및 시청
- 방 나가기 시 상대방에게 퇴장 알림 및 방 자동 정리

## 4. 기술 스택

| 구분        | 기술                                                       |
| ----------- | ---------------------------------------------------------- |
| Frontend    | Vanilla JavaScript, HTML/CSS                               |
| Backend     | Node.js, Express 5                                         |
| Database    | MongoDB Atlas                                              |
| 실시간 통신 | Socket.IO (시그널링/채팅), WebRTC (P2P 영상·음성·화면공유) |
| 인증        | JWT, bcrypt                                                |
| 환경설정    | dotenv                                                     |

## 5. 프로젝트 구조

```
WebRTC/
├── app.mjs                  # 서버 진입점
├── config.mjs               # 환경 변수 관리
├── db/
│   └── user_database.mjs    # MongoDB 연결 및 컬렉션 접근
├── router/
│   ├── auth.mjs             # 인증 관련 라우트 (/auth)
│   ├── room.mjs             # 과외방 관련 라우트 (/room)
│   └── lobby.mjs            # 로비 페이지 라우트 (/lobby)
├── controller/
│   ├── auth.mjs             # 회원가입/로그인/내 정보 조회 로직
│   └── room.mjs             # 방 생성/조회/삭제 로직
├── repository/
│   ├── auth.mjs             # 사용자 데이터 CRUD
│   └── room.mjs             # 과외방 데이터 CRUD
├── middleware/
│   └── auth.mjs             # JWT 검증(isAuth) 미들웨어
└── public/
    ├── index.html
    ├── signup.html
    ├── T_lobby.html
    ├── S_lobby.html
    ├── room.html
    ├── css/
    └── js/
```

## 6. 아키텍처

**Router → Controller → Repository** 3계층 구조를 따릅니다.

- **Router** : HTTP 요청 경로 및 미들웨어 연결
- **Controller** : 요청 검증, 응답 처리 등 비즈니스 로직 조립
- **Repository** : MongoDB 컬렉션에 대한 실제 데이터 접근

실시간 기능은 두 갈래로 나뉩니다.

- **로비 채팅/인원 관리**: Socket.IO의 `join` / `chat` / `switchChannel` 이벤트로 처리되며, 서버가 접속자 목록을 메모리에서 관리합니다.
- **1:1 화상 통화**: 서버는 `offer` / `answer` / `ice-candidate` 시그널링만 중계하고, 실제 영상·음성·화면 데이터는 브라우저 간 WebRTC P2P로 직접 전송됩니다. NAT 통과를 위해 Google 공개 STUN 서버를 사용합니다.

> 참고: Socket.IO의 "채널"(로비 내 실시간 채팅방)과 MongoDB에 저장되는 "방"(선생님이 개설하는 과외 세션)은 이름은 비슷하지만 서로 다른 개념입니다.
