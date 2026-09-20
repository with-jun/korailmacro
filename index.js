const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { launch } = require('./browser');
const { Korail } = require('./korail');
const { sendTelegram } = require('./telegram');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}
function log(...args) {
  console.log(`[${ts()}]`, ...args);
}

async function main() {
  const configPath = process.argv[2] || path.resolve(__dirname, 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error(`설정 파일이 없습니다: ${configPath}`);
    console.error('config.example.json 을 config.json 으로 복사하고 값을 채우세요.');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const { browser, page } = await launch(config.browser || {});

  const korail = new Korail(page, config, log);

  let success = false;
  let trainNum = null;
  try {
    if (config.korail?.autoLogin && config.korail?.memberNo && config.korail?.password) {
      log('자동 로그인 시도');
      try {
        await korail.login();
      } catch (err) {
        log(err.message);
        log('수동 로그인으로 폴백 — 브라우저에서 직접 로그인하세요.');
      }
    } else {
      log('수동 로그인 모드 — 브라우저에서 로그인 + 검색조건 입력 후 조회 버튼을 누르세요.');
      await korail.openLoginPage();
    }

    let atSearchList = false;
    while (true) {
      if (!atSearchList) await korail.waitForUserToReachSearchList();
      atSearchList = false;

      const selection = await korail.waitForUserToSelectAndStart();
      const result = await korail.monitor(selection);

      if (result.reason === 'paused') {
        log('일시중단 — 다시 선택할 수 있습니다.');
        continue;
      }

      if (result.success) {
        success = true;
        trainNum = result.trainNum;
        const msg = result.waitlist
          ? `[Korail] 예약대기 신청: ${trainNum}호. 좌석 배정 시 코레일 안내에 따라 결제하세요.`
          : `[Korail] 예약 성공: ${trainNum}호. 5분 안에 결제를 완료하세요.`;
        log(result.waitlist ? `예약대기 신청: ${trainNum}호` : `예약 성공: ${trainNum}호`);
        await sendTelegram(config.telegram, msg);
        try { process.stdout.write('\x07\x07\x07'); } catch (_) {}
      } else {
        log(`모니터링 종료: ${result.reason || '알 수 없음'}`);
      }

      // 콘솔 Enter 로 종료하거나, 검색 결과 페이지로 돌아오면 다시 선택 화면을 띄움
      log('브라우저는 결제 완료까지 열려있습니다.');
      log('다시 예매하려면 검색 결과 페이지로 돌아가세요. 종료하려면 콘솔에서 Enter.');
      const next = await Promise.race([
        waitForEnter().then(() => 'exit'),
        korail.waitForUserToReachSearchList().then(() => 'again'),
      ]);
      if (next === 'exit') break;
      atSearchList = true;
      log('검색 결과 페이지 복귀 — 다시 선택할 수 있습니다.');
    }
  } catch (err) {
    log('에러:', err);
    await sendTelegram(
      config.telegram,
      `[Korail] 매크로 에러: ${err.message}`
    );
  } finally {
    try { await browser.close(); } catch (_) {}
  }

  process.exit(success ? 0 : 1);
}

// 여러 번 호출되므로 readline 인터페이스는 하나만 만들어 재사용
let rl = null;
function waitForEnter() {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return new Promise((resolve) => rl.once('line', resolve));
}

main().catch((err) => {
  console.error('치명적 에러:', err);
  process.exit(1);
});
