/* Run with node --test. Set PLAYWRIGHT_MODULE_PATH when Playwright is installed outside this repo.
   EE_BASELINE optionally profiles the current approved pre-edit file. No server/network is needed. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const source = fs.readFileSync('EEflowchart.html', 'utf8');
const baseline = process.env.EE_BASELINE ? fs.readFileSync(process.env.EE_BASELINE, 'utf8') : require('node:child_process').execFileSync('git', ['show', 'a8ca35ce0b32c245fa7f0566e56aa2298503a3d8:EEflowchart.html'], { encoding: 'utf8' });
const snapshot = JSON.parse(fs.readFileSync('tests/ee-academic-snapshot.json', 'utf8'));
const url = 'http://ee.test/EEflowchart.html';
let browser;
before(async () => { browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] }); });
after(async () => { await browser?.close(); });
async function open(t, { width = 1440, mobile = false, storage = {}, body = source, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce', ...options });
  t.after(() => context.close());
  await context.route('**/*', route => route.request().url() === url
    ? route.fulfill({ body, contentType: 'text/html' }) : route.abort());
  await context.addInitScript(values => { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); }, storage);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught browser errors throughout workflow'));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 49);
  await settle(page);
  return { page, context };
}
async function settle(page) { await page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); }); }
async function list(page) { await page.locator('#viewList').click(); await settle(page); }
async function course(page, id) { await page.locator('#' + id).click(); await page.locator('#detail').waitFor({ state: 'visible' }); }
async function setStatus(page, id, status) { await course(page, id); await page.locator(`[data-state="${status}"]`).click(); await page.locator('#detailClose').click(); }
function savedState(values) { return { ee_plan_v2: JSON.stringify(values) }; }
const profiles = [{ name: 'mobile', width: 390, mobile: true }, { name: 'tablet', width: 768, mobile: true }, { name: 'desktop', width: 1440, mobile: false }];

test('academic data, hours, electives, all translations and function translations match current checkpoint', async t => {
  const { page } = await open(t);
  const data = await page.evaluate(() => JSON.parse(JSON.stringify({ courses, connections, CH, ELECT, T }, (key, value) => typeof value === 'function' ? value.toString() : value)));
  assert.deepEqual(data, snapshot);
  assert.equal(new Set(data.courses.map(c => c.id)).size, 49);
  assert.equal(Object.values(data.CH).reduce((a, b) => a + b, 0), 128);
  assert.equal(data.connections.length, 54);
  for (const edge of data.connections) assert.ok(data.CH[edge.from] && data.CH[edge.to]);
  assert.equal(await page.locator('.brand-ar').textContent(), 'الرصاصي');
});

for (const profile of profiles) {
  test(`${profile.name}: course panel, prerequisite/co-requisite highlighting and status persistence`, async t => {
    const { page } = await open(t, profile);
    await list(page);
    await course(page, 'PHY102');
    assert.equal(await page.locator('#PHY101.rel-pre').count(), 1);
    assert.equal(await page.locator('#MA102.rel-co').count(), 1);
    assert.equal(await page.locator('#EE201.rel-next').count(), 1);
    assert.equal(await page.locator('#PHY102.selected').count(), 1);
    await page.locator('[data-state="current"]').click();
    assert.equal(await page.locator('#PHY102.current').count(), 1);
    assert.equal(await page.locator('#percent').textContent(), '0%');
    await page.locator('[data-state="completed"]').click();
    assert.match(await page.locator('#progressText').textContent(), /4 \/ 128/);
    assert.equal(await page.locator('#percent').textContent(), '3%');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.ee_plan_v2).PHY102), 'completed');
    await page.reload(); await settle(page);
    assert.equal(await page.locator('#PHY102.completed').count(), 1);
    await course(page, 'PHY102'); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#detail').isHidden(), true);
  });
  test(`${profile.name}: bulk selection toggling, hour totals and all three status actions`, async t => {
    const { page } = await open(t, profile);
    await list(page); await page.locator('#bulkToggle').click();
    assert.equal(await page.locator('[data-bulk="completed"]').isDisabled(), true);
    for (const id of ['MA101', 'CHEM101', 'EE203']) await page.locator('#' + id).click();
    assert.match(await page.locator('#bulkHours').textContent(), /9/);
    await page.locator('#EE203').click();
    assert.match(await page.locator('#bulkHours').textContent(), /8/);
    assert.equal(await page.locator('#MA101').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-bulk="completed"]').click();
    assert.match(await page.locator('#progressText').textContent(), /8 \/ 128/);
    assert.equal(await page.locator('.bulk-selected').count(), 0);
    await page.locator('#MA101').click(); await page.locator('[data-bulk="current"]').click();
    assert.match(await page.locator('#progressText').textContent(), /4 \/ 128/);
    await page.locator('#MA101').click(); await page.locator('[data-bulk="none"]').click();
    assert.equal(await page.evaluate(() => Object.hasOwn(state, 'MA101')), false);
    await page.locator('#bulkCancel').click();
    assert.equal(await page.locator('#MA101').getAttribute('aria-pressed'), null);
  });
  test(`${profile.name}: search, filters, list/map preferences and English/light theme`, async t => {
    const { page } = await open(t, { ...profile, storage: savedState({ MA101: 'completed', CHEM101: 'current' }) });
    await list(page);
    await page.locator('#search').fill('ma 101');
    assert.equal(await page.locator('.card:visible').count(), 1);
    await page.locator('#search').fill('missing course'); assert.equal(await page.locator('#empty').isVisible(), true);
    await page.locator('#search').fill('');
    await page.locator('#filter').selectOption('completed'); assert.equal(await page.locator('.card:visible').count(), 1);
    await page.locator('#filter').selectOption('current'); assert.equal(await page.locator('#CHEM101').isVisible(), true);
    await page.locator('#filter').selectOption('available'); assert.equal(await page.locator('#MA102').isVisible(), true);
    assert.equal(await page.locator('#EE201').isVisible(), false);
    await page.locator('#filter').selectOption('all');
    await page.locator('#langBtn').click(); await page.locator('#themeBtn').click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await page.locator('.brand-ar').textContent(), 'Al-Rasasi');
    await page.locator('#viewMap').click(); await settle(page);
    assert.equal(await page.evaluate(() => localStorage.ee_view), 'map');
    await page.locator('#zoomIn').click(); await settle(page);
    assert.ok(await page.evaluate(() => scale > fitScale()));
    await page.locator('#zoomFit').click(); await settle(page);
    assert.ok(await page.evaluate(() => Math.abs(scale - fitScale()) < .001));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `/tmp/ee-current-${profile.name}.png`, fullPage: true });
    await page.reload(); await settle(page);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await page.locator('#viewMap').getAttribute('aria-pressed'), 'true');
  });
  test(`${profile.name}: recommendation assumptions, co-requisite bundles and mode transitions`, async t => {
    const { page } = await open(t, { ...profile, storage: savedState({ MA101: 'current' }) });
    await page.locator('#plan').click(); await settle(page);
    assert.ok(await page.evaluate(() => recommended.some(c => c.id === 'MA102')));
    await page.locator('#assume').uncheck();
    assert.equal(await page.evaluate(() => recommended.some(c => c.id === 'MA102')), false);
    const result = await page.evaluate(() => ({ phy: recommended.find(c => c.id === 'PHY101'), ids: recommended.map(c => c.id) }));
    assert.deepEqual(result.phy.co, ['MA101']);
    assert.equal(result.ids.includes('EE201'), false);
    await page.locator('#bulkToggle').click();
    assert.equal(await page.locator('#recommendBar').isHidden(), true);
    assert.equal(await page.locator('#bulkbar').isVisible(), true);
    await page.locator('#plan').click();
    assert.equal(await page.locator('#bulkbar').isHidden(), true);
    await page.locator('#search').fill('calculus');
    assert.equal(await page.locator('#recommendBar').isHidden(), true);
  });
  test(`${profile.name}: map course tap/click, small jitter, drag suppression and subsequent selection`, async t => {
    const { page, context } = await open(t, { ...profile, storage: { ee_view: 'map' } });
    // Enlarge enough to make a physical touch target and scrolling room.
    await page.evaluate(() => { setZoom(1); queueCamera(0, 0); }); await settle(page);
    const box = await page.locator('#ARB101').boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    if (profile.mobile) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 2, y: y + 1, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await page.mouse.click(x, y);
    assert.equal(await page.locator('#detailCode').textContent(), 'ARB 101');
    await page.locator('#detailClose').click(); await settle(page);
    const next = await page.locator('#ARB101').boundingBox();
    await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
    await page.mouse.down(); await page.mouse.move(next.x + next.width / 2 - 80, next.y + next.height / 2 - 60, { steps: 20 }); await page.mouse.up();
    assert.equal(await page.locator('#detail').isHidden(), true);
    // A new independent input must not be swallowed by the previous drag.
    await page.locator('#zoomFit').click(); await settle(page);
    await page.locator('#ARB101').press('Enter');
    assert.equal(await page.locator('#detail').isVisible(), true);
  });
}

test('128-hour total, 122-hour internship gate and completed/current arithmetic', async t => {
  const all = Object.fromEntries(snapshot.courses.filter(c => c.id !== 'EE490').map(c => [c.id, 'completed']));
  const { page } = await open(t, { storage: savedState(all) });
  assert.match(await page.locator('#progressText').textContent(), /122 \/ 128/);
  assert.equal(await page.evaluate(() => available('EE490')), true);
  await list(page); await setStatus(page, 'EE203', 'current');
  assert.equal(await page.evaluate(() => available('EE490')), false);
  assert.match(await page.locator('#progressText').textContent(), /121 \/ 128/);
  await page.locator('#plan').click();
  assert.ok(await page.evaluate(() => recommended.some(c => c.id === 'EE490')));
  await page.locator('#assume').uncheck(); assert.equal(await page.evaluate(() => recommended.some(c => c.id === 'EE490')), false);
  await page.locator('#endRecommendations').click(); await list(page);
  await setStatus(page, 'EE203', 'completed'); await setStatus(page, 'EE490', 'completed');
  assert.equal(await page.locator('#percent').textContent(), '100%');
  assert.match(await page.locator('#progressText').textContent(), /128 \/ 128/);
});

test('legacy migration, invalid storage and denied storage remain usable', async t => {
  const { page } = await open(t, { storage: { ee_completed_courses: JSON.stringify(['MA101', 'bad']) } });
  assert.equal(await page.locator('#MA101.completed').count(), 1);
  assert.equal(await page.evaluate(() => localStorage.ee_completed_courses), '["MA101","bad"]');
  const bad = await open(t, { storage: { ee_plan_v2: '{bad json' } });
  assert.equal(await bad.page.locator('.completed').count(), 0);
  assert.notEqual(await bad.page.locator('#toast').textContent(), '');
  await list(bad.page); await setStatus(bad.page, 'MA101', 'completed');
  await bad.page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  await setStatus(bad.page, 'MA101', 'current');
  assert.equal(await bad.page.locator('#saveNote').textContent(), await bad.page.evaluate(() => t('save_fail')));
});

test('JSON export/import, legacy import, rejected/cancelled imports and help/electives', async t => {
  const { page } = await open(t, { storage: savedState({ MA101: 'completed' }) });
  await page.locator('.footer summary').click();
  const download = page.waitForEvent('download'); await page.locator('#export').click();
  const file = await download; const data = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  assert.deepEqual(data, { version: 2, plan: 'ee-49', state: { MA101: 'completed' } });
  async function upload(value, accept = true) {
    const dialog = page.waitForEvent('dialog').then(d => accept ? d.accept() : d.dismiss());
    await page.locator('#import').setInputFiles({ name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
    await dialog;
  }
  await upload({ version: 2, plan: 'ee-49', state: { EE203: 'current', ARB101: 'none' } });
  assert.deepEqual(await page.evaluate(() => state), { EE203: 'current' });
  await upload(['MA101', 'PHY101']);
  assert.deepEqual(await page.evaluate(() => state), { MA101: 'completed', PHY101: 'completed' });
  await upload([], false); assert.equal(await page.locator('.completed').count(), 2);
  for (const value of [{ version: 2, plan: 'wrong', state: {} }, { version: 2, plan: 'ee-49', state: { bad: 'completed' } }, ['bad']]) {
    await page.locator('#import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
    assert.equal(await page.locator('#toast').textContent(), await page.evaluate(() => t('n_bad')));
    assert.equal(await page.locator('.completed').count(), 2);
  }
  await page.locator('#help').click(); assert.equal(await page.locator('#helpDialog').isVisible(), true);
  await page.locator('#helpDialog [data-close]').click();
  await list(page); await course(page, 'EE4xx_1'); await page.locator('#detailBody summary').click();
  assert.equal(await page.locator('#detailBody li').count(), 10);
});

test('wheel anchor, zoom limits, stable SVG and no-op refresh DOM budget', async t => {
  const { page } = await open(t, { storage: { ee_view: 'map' } });
  await page.evaluate(() => { setZoom(1); }); await settle(page);
  const result = await page.evaluate(async () => {
    const view = document.getElementById('viewport'); view.scrollLeft = 150; view.scrollTop = 150;
    const rect = view.getBoundingClientRect(), px = 100, py = 100;
    const anchor = { x: (view.scrollLeft + px) / scale, y: (view.scrollTop + py) / scale };
    const first = document.querySelector('#lines path[data-edge]');
    let geometryReads = 0, svgMutations = 0;
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { if (this.classList.contains('card')) geometryReads++; return original.call(this); };
    const observer = new MutationObserver(records => svgMutations += records.filter(r => r.type === 'childList').length);
    observer.observe(document.getElementById('lines'), { childList: true, subtree: true });
    for (let i = 0; i < 40; i++) view.dispatchEvent(new WheelEvent('wheel', { deltaY: -.5, ctrlKey: true, clientX: rect.left + px, clientY: rect.top + py, cancelable: true }));
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
    observer.disconnect(); Element.prototype.getBoundingClientRect = original;
    return { geometryReads, svgMutations, stable: first.isConnected,
      drift: Math.hypot((view.scrollLeft + px) / scale - anchor.x, (view.scrollTop + py) / scale - anchor.y) };
  });
  assert.ok(result.drift < 2, JSON.stringify(result));
  assert.equal(result.geometryReads, 0); assert.equal(result.svgMutations, 0); assert.ok(result.stable);
  const mutations = await page.evaluate(async () => {
    let count = 0; const obs = new MutationObserver(r => count += r.length);
    obs.observe(document.getElementById('years'), { attributes: true, characterData: true, childList: true, subtree: true });
    for (let i = 0; i < 10; i++) refresh();
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);obs.disconnect();return count;
  });
  assert.equal(mutations, 0);
  await page.evaluate(() => setZoom(Infinity)); await settle(page); assert.equal(await page.evaluate(() => scale), 2.2);
  await page.evaluate(() => setZoom(.001)); await settle(page); assert.ok(await page.evaluate(() => scale === minScale()));
});

test('native pinch midpoint translation, cancellation, pointer cleanup and list gesture isolation', async t => {
  const { page, context } = await open(t, { width: 768, mobile: true, storage: { ee_view: 'map' } });
  await page.evaluate(() => setZoom(1)); await settle(page);
  await page.evaluate(() => { vp.scrollLeft = 200; vp.scrollTop = 200; });
  const box = await page.locator('#viewport').boundingBox(); const y = box.y + 180;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y, id: 1 }, { x: 400, y, id: 2 }] });
  const start = await page.evaluate(y => ({ x: (vp.scrollLeft + 300 - vp.getBoundingClientRect().left) / scale, y: (vp.scrollTop + y - vp.getBoundingClientRect().top) / scale, scale }), y);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: y + 20, id: 1 }, { x: 450, y: y + 20, id: 2 }] });
  await settle(page);
  const end = await page.evaluate(y => ({ x: (vp.scrollLeft + 320 - vp.getBoundingClientRect().left) / scale, y: (vp.scrollTop + y + 20 - vp.getBoundingClientRect().top) / scale, scale }), y);
  assert.ok(end.scale > start.scale); assert.ok(Math.abs(start.x - end.x) < 2); assert.ok(Math.abs(start.y - end.y) < 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal(await page.evaluate(() => pointers.size), 0); assert.equal(await page.locator('#detail').isHidden(), true);
  await list(page); const oldScale = await page.evaluate(() => scale);
  await page.locator('#viewport').dispatchEvent('wheel', { ctrlKey: true, deltaY: -100 }); await settle(page);
  assert.equal(await page.evaluate(() => scale), oldScale);
});

test('recommendation order and academic decisions equal current pre-edit implementation', async t => {
  const outputs = [];
  for (const body of [baseline, source]) {
    const { page } = await open(t, { body });
    outputs.push(await page.evaluate(() => {
      const cases = [{}, { MA101: 'completed', PHY101: 'completed' }, { MA101: 'current', CSE101: 'completed', MA202: 'completed' }, Object.fromEntries(courses.filter(c => c.id !== 'EE490').map(c => [c.id, 'completed']))];
      return cases.flatMap(value => [false, true].map(assume => {
        state = value; save(); document.getElementById('assume').checked = assume; recommendations();
        return { available: courses.map(c => [c.id, available(c.id)]), recommended: recommended.map(c => ({ id: c.id, co: c.co, score: c.score, unlocked: c.unlocked, critical: c.critical, downstream: c.downstream })) };
      }));
    }));
  }
  assert.deepEqual(outputs[1], outputs[0]);
});

test('before/after browser profile: zoom SVG rebuilding, geometry and no-op refresh', async t => {
  const results = [];
  for (const body of [baseline, source]) {
    const { page } = await open(t, { body, storage: { ee_view: 'map' } });
    const samples = [];
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    for (let trial = 0; trial < 3; trial++) {
      await settle(page);
      const beforeMetrics = (await cdp.send('Performance.getMetrics')).metrics;
      const sample = await page.evaluate(async () => {
        const svg = document.getElementById('lines'); let geometryReads = 0, svgChanges = 0;
        const original = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function () { if (this.classList.contains('card')) geometryReads++; return original.call(this); };
        const obs = new MutationObserver(r => svgChanges += r.filter(x => x.type === 'childList').length);
        obs.observe(svg, { childList: true, subtree: true });
        const start = performance.now();
        for (let i = 0; i < 30; i++) setZoom(scale * 1.001);
        for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
        const elapsedMs = performance.now() - start;
        obs.disconnect(); Element.prototype.getBoundingClientRect = original;
        return { geometryReads, svgChanges, elapsedMs };
      });
      const afterMetrics = (await cdp.send('Performance.getMetrics')).metrics;
      sample.browser = Object.fromEntries(['LayoutCount', 'RecalcStyleCount', 'ScriptDuration', 'LayoutDuration', 'TaskDuration'].map(name => [name, afterMetrics.find(m => m.name === name).value - beforeMetrics.find(m => m.name === name).value]));
      samples.push(sample);
    }
    results.push(samples);
  }
  const report = { baseline: results[0], current: results[1] };
  fs.writeFileSync('/tmp/ee-current-benchmark.json', JSON.stringify(report, null, 2));
  console.log('EE current-file baseline profile:', JSON.stringify(report));
  assert.equal(results[1][0].geometryReads, 0); assert.equal(results[1][0].svgChanges, 0);
});

for (const profile of profiles) test(`${profile.name}: Arabic/dark layout, coarse targets, resize and keyboard bulk selection`, async t => {
  const { page } = await open(t, profile);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  if (profile.mobile) {
    const targets = await page.evaluate(() => ({ coarse: matchMedia('(pointer:coarse)').matches, heights: ['themeBtn', 'langBtn', 'viewMap', 'viewList', 'bulkToggle', 'plan', 'filter', 'search'].map(id => [id, document.getElementById(id).getBoundingClientRect().height]) }));
    assert.ok(targets.coarse);
    for (const [id, height] of targets.heights) assert.ok(height >= 44, `${id}: ${height}`);
  }
  await list(page); await page.locator('#bulkToggle').click();
  await page.locator('#MA101').focus(); await page.keyboard.press('Space');
  assert.equal(await page.locator('#MA101').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Space'); assert.equal(await page.locator('#MA101').getAttribute('aria-pressed'), 'false');
  await page.locator('#bulkCancel').click(); await course(page, 'MA101');
  if (profile.mobile) assert.ok((await page.locator('[data-state="completed"]').boundingBox()).height >= 44);
  await page.locator('#detailClose').click(); await page.locator('#viewMap').click(); await settle(page);
  await page.setViewportSize({ width: profile.width === 390 ? 844 : profile.width - 80, height: 600 }); await settle(page);
  assert.ok(await page.evaluate(() => Number.isFinite(scale) && document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: `/tmp/ee-current-${profile.name}-dark.png`, fullPage: true });
});

test('native wheel scrolling, active pointer cancellation and view-switch cleanup', async t => {
  const { page, context } = await open(t, { width: 768, mobile: true, storage: { ee_view: 'map' } });
  await page.evaluate(() => { setZoom(1.5); queueCamera(100, 100); }); await settle(page);
  const currentScale = await page.evaluate(() => scale);
  const box = await page.locator('#viewport').boundingBox();
  await page.mouse.move(box.x + 50, box.y + 50);
  const before = await page.evaluate(() => vp.scrollTop);
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(top => vp.scrollTop > top, before);
  assert.equal(await page.evaluate(() => scale), currentScale);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 40, y: box.y + 40, id: 1 }] });
  assert.equal(await page.evaluate(() => pointers.size), 1);
  // The mode controller must release capture even when view changes during contact.
  await page.evaluate(() => setView(true, true));
  assert.equal(await page.evaluate(() => pointers.size), 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await course(page, 'MA101'); assert.equal(await page.locator('#detail').isVisible(), true);
});
