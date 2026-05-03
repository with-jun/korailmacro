const { detectCaptcha } = require('./captcha');

const URL_MAIN = 'https://www.korail.com/ticket/main';
const URL_LOGIN = 'https://www.korail.com/ticket/login';
const URL_SEARCH = 'https://www.korail.com/ticket/search/list';

const SEL = {
  trainRow: '.tckWrap .tckList',
  trainInner: '.tck_inner',
  trainNum: '.num',
  priceBox: '.tck_inner > .price_box',
  captImg: '#captImg',
  captAnswer: '#chkCapAnswer',
  captSubmit: '.ui-dialog button',
};

class Korail {
  constructor(page, config, log) {
    this.page = page;
    this.config = config;
    this.log = log || ((...a) => console.log(...a));
    this._installNetFunnelObserver();
  }

  async _installNetFunnelObserver() {
    this.page.on('console', (msg) => {
      const t = msg.text();
      if (t.includes('NetFunnel') || t.includes('통신 중 오류')) {
        this.log(`[page] ${t}`);
      }
    });
    this.page.on('dialog', async (dialog) => {
      const m = dialog.message();
      this.log(`[dialog:${dialog.type()}] ${m}`);
      if (m.includes('입력값이 일치하지 않습니다')) {
        await dialog.dismiss();
        await this.page.reload({ waitUntil: 'networkidle2' });
        return;
      }
      if (dialog.type() === 'confirm') {
        await dialog.accept();
        return;
      }
      await dialog.dismiss();
    });
  }

  async openLoginPage() {
    await this.page.goto(URL_LOGIN, { waitUntil: 'networkidle2' });
  }

  async login() {
    const { memberNo, password } = this.config.korail;
    if (!memberNo || !password) {
      throw new Error('config.korail.memberNo / password 가 비어있습니다.');
    }
    await this.page.goto(URL_LOGIN, { waitUntil: 'networkidle2' });
    this.log('로그인 폼 셀렉터는 페이지 변경에 민감 — 자동 로그인 실패 시 수동 로그인 모드로 다시 실행하세요.');
    try {
      await this.page.waitForSelector('input#id, input[name="id"]', { timeout: 8000 });
      await this.page.type('input#id, input[name="id"]', memberNo, { delay: 60 });
      await this.page.type('input#password, input[name="password"]', password, { delay: 60 });
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
        this.page.click('button.btn_bn-depblue'),
      ]);
    } catch (err) {
      throw new Error(`자동 로그인 실패: ${err.message}. 수동 로그인 모드로 전환을 권장합니다.`);
    }
  }

  async waitForUserToReachSearchList() {
    this.log('브라우저에서 직접 로그인하고 검색하여 결과 목록 페이지에 도달하세요.');
    this.log(`(URL: ${URL_SEARCH} 으로 이동되면 자동으로 인계받습니다.)`);
    await this.page.waitForFunction(
      (urlPrefix) => location.href.startsWith(urlPrefix),
      { timeout: 0, polling: 1000 },
      URL_SEARCH,
    );
    await this.page.waitForSelector(SEL.trainRow, { timeout: 30000 });
    this.log('검색 결과 페이지 인식 — 모니터링 시작');
  }

  async monitor() {
    const targetTrains = new Set((this.config.trains || []).map(String));
    if (targetTrains.size === 0) {
      throw new Error('config.trains 가 비어있습니다.');
    }
    const minDelay = this.config.polling?.minDelayMs ?? 3000;
    const maxDelay = this.config.polling?.maxDelayMs ?? 6000;
    const maxIter = this.config.polling?.maxIterations ?? 0;

    let iter = 0;
    while (true) {
      iter += 1;
      if (maxIter > 0 && iter > maxIter) {
        return { success: false, reason: 'maxIterations 도달' };
      }

      try {
        await this.page.waitForSelector(SEL.trainRow, { timeout: 15000 });
      } catch (err) {
        this.log(`목록을 찾지 못함: ${err.message}. 페이지 상태 확인 필요.`);
        await sleep(2000);
        continue;
      }

      const candidates = await this._scrapeCandidates([...targetTrains]);
      const status = candidates
        .map(c => `${c.trainNum}[${c.seats.map(s => s.label).join('/')}]`)
        .join(' ');
      this.log(`[#${iter}] 후보 ${candidates.length}: ${status || '없음'}`);

      const target = candidates.find(c => c.seats.some(s => s.available));
      if (target) {
        const seat = target.seats.find(s => s.available);
        this.log(`예약 시도: ${target.trainNum}호 / 좌석유형 idx=${seat.seatIdx}`);
        const result = await this._tryReserve(target, seat);
        if (result.success) {
          return { success: true, trainNum: target.trainNum };
        }
        this.log(`예약 실패: ${result.reason} — 계속 모니터링`);
      }

      const delay = jitter(minDelay, maxDelay);
      await sleep(delay);

      this.log('재조회 (reload)');
      try {
        await this.page.reload({ waitUntil: 'networkidle2' });
        await this.page.waitForSelector(SEL.trainRow, { timeout: 15000 });
      } catch (err) {
        this.log(`reload 실패: ${err.message} — 재시도`);
        await sleep(2000);
      }
    }
  }

  async _scrapeCandidates(targets) {
    return await this.page.evaluate((targets, sel) => {
      const rows = Array.from(document.querySelectorAll(sel.trainRow));
      const results = [];
      rows.forEach((row, rowIdx) => {
        const numEl = row.querySelector(sel.trainNum);
        if (!numEl) return;
        const trainNum = numEl.textContent.trim();
        if (!targets.includes(trainNum)) return;

        const priceBoxes = Array.from(row.querySelectorAll(sel.priceBox));
        const seats = priceBoxes.map((pb, seatIdx) => {
          const cls = Array.from(pb.classList);
          const text = pb.textContent.trim();
          const soldOut = cls.includes('sold_out') || /매진/.test(text);
          const disabled = text === '-' || /^-$/.test(text);
          const reservAnchor = pb.querySelector('a');
          const available = !!reservAnchor && !soldOut && !disabled;
          let label = '-';
          if (soldOut) label = '매진';
          else if (disabled) label = '없음';
          else if (available) label = '가능';
          return { seatIdx, soldOut, disabled, available, label };
        });

        results.push({ rowIdx, trainNum, seats });
      });
      return results;
    }, targets, SEL);
  }

  async _tryReserve(train, seat) {
    const seatHandle = await this.page.evaluateHandle((sel, rowIdx, seatIdx) => {
      const rows = document.querySelectorAll(sel.trainRow);
      const row = rows[rowIdx];
      if (!row) return null;
      const priceBoxes = row.querySelectorAll(sel.priceBox);
      const pb = priceBoxes[seatIdx];
      if (!pb) return null;
      return pb.querySelector('a');
    }, SEL, train.rowIdx, seat.seatIdx);

    const el = seatHandle.asElement();
    if (!el) return { success: false, reason: '좌석 앵커 못 찾음' };

    try {
      await el.scrollIntoView();
    } catch (_) {}

    try {
      await el.click({ delay: 30 });
    } catch (err) {
      return { success: false, reason: `좌석 클릭 실패: ${err.message}` };
    }

    const captchaResult = await this._handleCaptchaIfPresent();
    if (captchaResult === 'failed') {
      return { success: false, reason: 'CAPTCHA 처리 실패' };
    }

    const reservButtonClicked = await this._clickReservButton();
    if (!reservButtonClicked) {
      return { success: false, reason: '예약 확인 버튼 못 찾음' };
    }

    const arrived = await this._waitForReservationPage();
    if (arrived) return { success: true };
    return { success: false, reason: '예약 페이지 도달 실패 — 매진/오류 가능성' };
  }

  async _handleCaptchaIfPresent() {
    if (!this.config.ocr?.enabled) return 'absent';
    try {
      await this.page.waitForSelector(SEL.captImg, { timeout: 1500 });
    } catch (_) {
      return 'absent';
    }
    this.log('CAPTCHA 감지 — OCR 호출');
    try {
      const dataUrl = await this.page.evaluate((sel) => {
        const img = document.querySelector(sel);
        if (!img) return null;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        return canvas.toDataURL();
      }, SEL.captImg);
      if (!dataUrl) return 'failed';
      const text = await detectCaptcha(dataUrl, this.config.ocr.endpoint);
      this.log(`OCR 결과: "${text}"`);
      await this.page.type(SEL.captAnswer, text, { delay: 50 });
      await this.page.click(SEL.captSubmit);
      return 'ok';
    } catch (err) {
      this.log(`CAPTCHA 처리 에러: ${err.message}`);
      return 'failed';
    }
  }

  async _clickReservButton() {
    const candidates = [
      '.ticket_reserv_wrap .reservbtn',
      '.reservbtn',
      'button.btn_reserv',
      'button[class*="reserv" i]',
      'a.btn_bn-blue:has-text("예약")',
    ];
    for (const sel of candidates) {
      try {
        const el = await this.page.waitForSelector(sel, { timeout: 1500 });
        if (el) {
          await el.click({ delay: 30 });
          this.log(`예약 버튼 클릭: ${sel}`);
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  async _waitForReservationPage() {
    try {
      await this.page.waitForFunction(
        () => /\/ticket\/(reservation|payment|confirm|seat)/.test(location.pathname),
        { timeout: 6000 }
      );
      return true;
    } catch (_) {
      return false;
    }
  }

}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(min, max) {
  return Math.floor(min + Math.random() * Math.max(1, max - min));
}

module.exports = { Korail };
