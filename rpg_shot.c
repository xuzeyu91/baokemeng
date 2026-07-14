// RPG mode screenshot generator. Run with managed Node from the project dir.
const { chromium } = require('playwright');
const path = require('path');

const ROOT = 'C:/Users/28651/Desktop/baokemeng';
const OUT = path.join(ROOT, 'screenshots');
const NODELAY = 280;

async function shot(page, file) {
  await page.screenshot({ path: path.join(OUT, file) });
  console.log('shot ' + file);
}

(async () => {
  const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const context = await browser.newContext({
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const isBattle = () => page.$('#rpg-battle:not(.hidden)').then(e => !!e);
  const press = async (key) => { await page.keyboard.press(key); await page.waitForTimeout(NODELAY); };

  // 0) Hub / landing page
  console.log('Loading hub');
  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await shot(page, 'rpg-00-hub.png');

  // 1) Starter selection (fresh context -> no save -> modal shows)
  console.log('Loading rpg');
  await page.goto('file://' + path.join(ROOT, 'rpg.html'), { waitUntil: 'load' });
  await page.waitForSelector('#rpg-starter:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(2500); // let starter sprites load
  await shot(page, 'rpg-01-starter.png');

  // 2) Pick a starter -> map view
  await page.click('[data-starter="1"]'); // 妙蛙种子
  await page.waitForTimeout(2500); // map + party hud + sprites
  await shot(page, 'rpg-02-map.png');

  // 3) Walk into grass to trigger a wild encounter
  console.log('walking to grass...');
  for (let i = 0; i < 4; i++) await press('ArrowLeft'); // (16,13)->(12,13)
  await press('ArrowUp'); // (12,12) grass
  let up = true, triggered = false;
  for (let i = 0; i < 70; i++) {
    if (await isBattle()) { triggered = true; break; }
    await press(up ? 'ArrowUp' : 'ArrowDown'); // alternate within grass column x=12
    up = !up;
    if (await isBattle()) { triggered = true; break; }
  }
  console.log('battle triggered:', triggered);
  if (triggered) {
    await page.waitForTimeout(1000); // cards rendered
    await shot(page, 'rpg-03-battle.png');

    // 4) Use a move to capture damage / effect text
    const mv = await page.$('[data-bmove="0"]');
    if (mv) {
      await mv.click();
      await page.waitForTimeout(380);
      await shot(page, 'rpg-04-action.png');
      console.log('shot rpg-04-action');
    }
  } else {
    console.log('WARN: no encounter triggered');
  }

  if (errors.length) console.log('PAGE ERRORS:\n' + errors.slice(0, 5).join('\n'));
  else console.log('No page errors.');

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
