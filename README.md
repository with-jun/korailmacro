# Korail Macro

신규 코레일 페이지(`korail.com/ticket/search/list`, React + NetFunnel) 대응 자동 예약 매크로. Puppeteer + rebrowser-puppeteer-core + stealth 플러그인으로 안티봇 회피, 시스템 Chrome 직접 실행.

## 왜 Puppeteer 인가

- `page.click()` 은 CDP(Chrome DevTools Protocol)를 통해 OS 레벨 마우스 이벤트를 dispatch 하므로 `isTrusted: true` — React 핸들러에 정상 적용
- 실제 브라우저 컨텍스트에서 NetFunnel JS 가 정상 동작하여 큐 통과
- stealth 플러그인 + rebrowser 패치로 `Runtime.enable` 등 자동화 탐지 회피

## 동작 방식

1. Puppeteer 가 headed 모드로 Chromium 실행 (`.user-data/` 에 세션 저장)
2. 사용자가 직접 로그인 + 검색조건 입력 + 조회
3. 검색결과 페이지(`/ticket/search/list`) 도착하면 페이지 UI 에 **"매크로" 체크박스 + "시작" 버튼** 주입
4. 사용자가 모니터링할 열차에 체크 → "시작" 클릭
5. 좌석 확인 / 클릭 / 예약 버튼 자동 진행
6. 예약 페이지 도달 시 Telegram 알림 + 터미널 비프, 사용자가 5분 내 결제

검색결과 페이지를 reload 하여 재조회 + jitter 가 들어간 폴링 간격으로 NetFunnel mProtect 회피.

## 설치

```bash
npm install
cp config.example.json config.json
# config.json 편집
```

### 사전 요구사항

- **Google Chrome 정식 버전** 이 시스템에 설치되어 있어야 함 (Chromium 번들이 아닌 실제 Chrome 사용)
- 기본 경로:
  - macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  - Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`
  - Linux: `/usr/bin/google-chrome`
- 다른 경로에 있다면 `config.json` 의 `browser.executablePath` 에 절대경로 지정

### 안티-디텍션 (rebrowser-puppeteer-core)

NetFunnel 같은 한국 안티봇은 stealth 플러그인만으로 부족함. CDP 의 `Runtime.enable` 호출을 패치한 [`rebrowser-puppeteer-core`](https://github.com/rebrowser/rebrowser-patches) 를 사용하여 Puppeteer 자체의 핑거프린트를 가림. 추가로 시스템 Chrome 을 직접 실행하여 Chromium 번들 대비 더 사용자스러운 핑거프린트 유지.

## 설정 (config.json)

| 키 | 설명 |
|---|---|
| `browser.executablePath` | Chrome 실행파일 경로. 비우면 OS 별 기본 경로 사용 |
| `browser.userDataDir` | 프로필 디렉터리. 비우면 `.user-data` |
| `korail.memberNo` | 회원번호 (자동 로그인 사용 시) |
| `korail.password` | 비밀번호 (자동 로그인 사용 시) |
| `korail.autoLogin` | `true` 면 자동 로그인 시도, 실패 시 수동 폴백 |
| `polling.minDelayMs` / `maxDelayMs` | 재조회 간격 (jitter 범위). NetFunnel mProtect 회피 위해 3000~6000 권장 |
| `polling.maxIterations` | 최대 재시도 횟수. `0` 이면 무한 |
| `telegram.botToken` / `chatId` | 알림용 (아래 "Telegram 알림 설정" 참고). 비우면 알림 비활성 |

### Telegram 알림 설정 (선택)

예약 성공 시 텔레그램 메시지로 알림을 받고 싶으면 다음 절차로 봇 토큰과 채팅 ID 를 발급받아 `config.json` 에 채워넣음.

#### 1. 봇 생성 및 토큰 발급

1. Telegram 에서 [@BotFather](https://t.me/BotFather) 와 대화 시작
2. `/newbot` 입력 → 봇 이름(표시명) 입력 → 봇 username 입력 (`_bot` 으로 끝나야 함, 예: `my_korail_alert_bot`)
3. BotFather 가 응답으로 주는 **HTTP API token** 을 복사 (예: `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`)
4. 이 값을 `config.json` 의 `telegram.botToken` 에 넣음

#### 2. Chat ID 확인

1. 방금 만든 봇을 검색해서 대화 시작 → 아무 메시지나 한 번 보냄 (예: `/start`)
2. 브라우저에서 다음 주소 열기 (TOKEN 부분을 본인 토큰으로 교체):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
3. 응답 JSON 에서 `result[0].message.chat.id` 값을 찾아 `config.json` 의 `telegram.chatId` 에 넣음 (숫자, 음수일 수도 있음)

또는 [@userinfobot](https://t.me/userinfobot) 과 대화하면 본인 chat ID 를 즉시 알려줌.

#### 3. 동작 확인

`config.json` 예시:
```json
{
  "telegram": {
    "botToken": "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ",
    "chatId": "987654321"
  }
}
```

설정 후 매크로가 예약 성공 또는 에러 발생 시 `[Korail] 예약 성공: 1019호. 5분 안에 결제를 완료하세요.` 같은 메시지가 봇에서 옴.

## 실행

```bash
npm start
# 또는
node index.js ./config.json
```

브라우저가 뜨면:
1. 로그인 (`autoLogin: false` 인 경우 직접)
2. 메인 페이지에서 출발/도착/날짜 입력 후 "열차조회"
3. 결과 페이지(`/ticket/search/list`) 도착 → 자동 인계 시작
4. 콘솔에 `[#1] 후보 N: 1019[매진/-] ...` 같은 로그가 찍히면 정상

## 알려진 제약 / TODO

- **자동 검색** — 출발/도착역 팝업, 날짜피커, 인원 선택의 자동화는 미구현. 사용자가 직접 입력하는 게 안전.
- **자동 로그인 셀렉터** — `input#id` / `input#password` / `button.btn_bn-depblue` 가정. 페이지 변경 시 `korail.js` 의 `login()` 수정 필요.
- **예약 확인 버튼 셀렉터** — `_clickReservButton()` 에 후보 셀렉터 여러 개를 시도하는 형태. 신규 페이지 마크업 확인 후 첫 번째 후보를 정확한 셀렉터로 교체 권장.
- **NetFunnel 직접 제어** — 현재 코드는 NetFunnel JS 가 알아서 큐를 통과하도록 두는 방식. 정상 사용자처럼 행동하므로 보통 충분함. 만약 토큰이 만료되거나 `IP_BLOCK` 이 떨어지면 별도 처리 필요 (브라우저 재시작 / IP 변경).

## 안티-디텍션 측면

- `puppeteer-extra-plugin-stealth` 적용 — `navigator.webdriver`, plugins, languages, WebGL vendor 등 공통 봇 시그널 위장
- `--disable-blink-features=AutomationControlled` 플래그
- userDataDir 로 세션/쿠키/캐시 유지 (매번 새 fingerprint 안 만들기)
- 폴링 간격에 jitter, 클릭에 `delay` 추가
- 페이지 reload 회피 (NetFunnel mProtect 의 핵심 트리거 중 하나)

## 주의

- 이 스크립트는 학습/개인용 목적의 자동화 도구. 코레일 약관에 어긋날 수 있으며 IP 차단 / 계정 정지 등의 책임은 사용자에게 있음.
- 신규 페이지의 마크업/플로우는 코레일이 언제든 변경할 수 있음. 셀렉터가 안 맞으면 `korail.js` 의 `SEL` 객체와 메서드를 직접 수정.
