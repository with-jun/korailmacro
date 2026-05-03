const path = require('path');
const fs = require('fs');
const { addExtra } = require('puppeteer-extra');
const rebrowserPuppeteer = require('rebrowser-puppeteer-core');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

const puppeteer = addExtra(rebrowserPuppeteer);
puppeteer.use(StealthPlugin());

function defaultChromePath() {
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  if (process.platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }
  return '/usr/bin/google-chrome';
}

async function launch(options = {}) {
  const executablePath = options.executablePath || defaultChromePath();
  if (!fs.existsSync(executablePath)) {
    throw new Error(
      `Chrome 실행파일을 찾지 못했습니다: ${executablePath}\n` +
      `config.json 의 browser.executablePath 에 정확한 경로를 지정하세요.`
    );
  }

  const userDataDir = options.userDataDir
    ? path.resolve(options.userDataDir)
    : path.resolve(__dirname, '.user-data');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    userDataDir,
    executablePath,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1400,960',
      '--lang=ko-KR',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const [page] = await browser.pages();

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  });

  return { browser, page };
}

module.exports = { launch };
