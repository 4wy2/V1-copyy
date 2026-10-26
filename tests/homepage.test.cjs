/* Run with Node's test runner. Requires Playwright in the environment, not in production. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
let base = process.env.HOMEPAGE_URL;
let browser;
let server;
before(async () => {
    if (!base) {
        const path = require('node:path');
        const root = process.cwd();
        server = require('node:http').createServer((request, response) => {
            try {
                const name = decodeURIComponent(new URL(request.url, 'http://local').pathname);
                const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
                if (!file.startsWith(root + path.sep)) { response.writeHead(403); return response.end(); }
                const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
                const body = readFileSync(file);
                response.writeHead(200, {'content-type':mime[path.extname(file)] || 'application/octet-stream'});
                response.end(body);
            } catch { response.writeHead(404); response.end('Not found'); }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        base = 'http://127.0.0.1:' + server.address().port;
    }
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

const mockSdk = `window.__uploads = []; window.__inserts = []; window.__removed = [];
window.supabase = { createClient: () => ({
 storage: { from: () => ({
   upload: async (path, file) => {
     window.__uploads.push(file.name);
     if (window.__config?.delay) await new Promise(r => setTimeout(r, window.__config.delay));
     if (file.name === 'bad.pdf' && !window.__failedOnce) { window.__failedOnce = true; return {error: {message:'Upload failed'}}; }
     return {error: null};
   },
   getPublicUrl: path => ({data: {publicUrl: 'https://example.test/' + path}}),
   remove: async paths => { window.__removed.push(...paths); return {error: null}; }
 })},
 from: () => ({ insert: async rows => {
   window.__inserts.push(...rows);
   if (window.__config?.insertFailure && !window.__insertFailed) { window.__insertFailed = true; return {error: {message:'Insert failed'}}; }
   return {error: null};
 }})
})};`;
async function pageForTest(options = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
    // Never mutate the external backend during tests.
    await context.route('**/*.supabase.co/**', route => route.abort());
    await context.route('**/npm/@supabase/supabase-js@2', route => route.fulfill({ contentType: 'application/javascript', body: mockSdk }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    assert.deepEqual(errors, [], 'No startup exceptions');
    return { page, context, errors };
}
function file(name) { return { name, mimeType: 'application/pdf', buffer: Buffer.from('Test fixture only') }; }
async function openUpload(page) {
    await page.locator('#openUploadBtn').click();
    await page.locator('#subjectInput').fill('EE 201');
    await page.locator('#noteInput').fill('Student reference');
}

test('original homepage destinations and translated content remain available', async () => {
    const {page, context} = await pageForTest();
    try {
        const original = execFileSync('git', ['show', '326ed31:index.html'], {encoding:'utf8'});
        const expected = [...original.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map(match => match[1]);
        const links = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
        for (const href of expected) assert.ok(links.includes(href), `Preserved destination: ${href}`);
        const current = readFileSync('assets/js/homepage.js', 'utf8');
        const originalCopy = require('node:vm').runInNewContext('(' + original.match(/const copy = ([\s\S]*?);\n\n    const languageToggle/)[1] + ')');
        const currentCopy = await page.evaluate(() => window.eeHomepageCopy);
        for (const language of ['ar','en']) {
            for (const [key,value] of Object.entries(originalCopy[language])) assert.equal(currentCopy[language][key],value, `Preserved copy: ${language}/${key}`);
        }
        for (const [,id] of original.matchAll(/<button\b[^>]*\bid="([^"]+)"/g)) assert.equal(await page.locator('#'+id).count(),1,`Preserved button: ${id}`);

        for (const [, key] of original.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(current.includes(key + ':'), `Preserved content key: ${key}`);
        const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
        assert.equal(new Set(ids).size, ids.length, 'IDs must be unique');
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
        assert.match(await page.locator('footer').innerText(), /AL-RASSASI/);
        assert.equal(await page.locator('script[src*="supabase"]').count(), 0, 'SDK is lazy-loaded');
        for (const href of links.filter(href => !href.startsWith('#') && !/^https?:/.test(href))) {
            const response = await page.request.get(new URL(href, base).href);
            assert.equal(response.status(), 200, href);
        }
    } finally { await context.close(); }
});

test('language, theme, specialization selector and desktop navigation', async () => {
    const {page, context} = await pageForTest();
    try {
        await page.locator('#languageToggle').click();
        assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
        assert.equal(await page.title(), 'Electrical Engineering Study Plan');
        await page.locator('#themeToggle').click();
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
        await page.reload({waitUntil:'domcontentloaded'});
        assert.equal(await page.locator('html').getAttribute('lang'), 'en');
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
        for (const value of ['EEflowchart.html','EPTflowchart.html','ECTflowchart.html','ICTflowchart.html','MechT.html']) {
            await page.locator('#planSelect').selectOption(value);
            assert.equal(await page.locator('#selectedPlanLink').getAttribute('href'), value);
            assert.equal((await page.request.get(new URL(value, base).href)).status(), 200);
        }
        await page.locator('#openSidebar').click();
        assert.equal(await page.locator('#sidebar').getAttribute('aria-hidden'), 'false');
        assert.equal(await page.locator('main').evaluate(node => node.inert), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#openSidebar').evaluate(node => node === document.activeElement), true);
        assert.equal(await page.locator('main').evaluate(node => node.inert), false);
    } finally { await context.close(); }
});

test('responsive RTL/LTR, dark/light, keyboard dialogs, no page errors', async () => {
    const {page, context, errors} = await pageForTest();
    try {
        for (const width of [320,390,768,1440]) {
            await page.setViewportSize({width,height:900});
            for (const lang of ['ar','en']) {
                if (await page.locator('html').getAttribute('lang') !== lang) await page.locator('#languageToggle').click();
                for (const theme of ['dark','light']) {
                    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#themeToggle').click();
                    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow: ${width}/${lang}/${theme}`);
                }
            }
        }
        await page.locator('#openSidebar').click();
        await page.locator('.developer-link').waitFor({state:'visible'});
        await page.locator('.developer-link').focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('.sidebar-head a').evaluate(node => node === document.activeElement), true);
        await page.keyboard.press('Escape');
        await openUpload(page);
        await page.locator('#fileInput').focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('#closeUploadBtn').evaluate(node => node === document.activeElement), true);
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.locator('#fileInput').evaluate(node => node === document.activeElement), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#openUploadBtn').evaluate(node => node === document.activeElement), true);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('uploads preserve metadata, recover partial failures and retry only failed files', async () => {
    const {page, context} = await pageForTest();
    try {
        await openUpload(page);
        await page.locator('#fileInput').setInputFiles([file('good.pdf'), file('bad.pdf')]);
        await page.locator('#retryUploadBtn').waitFor({state:'visible'});
        assert.deepEqual(await page.evaluate(() => window.__uploads), ['good.pdf','bad.pdf']);
        assert.equal(await page.locator('#subjectInput').inputValue(), 'EE 201');
        await page.locator('#retryUploadBtn').click();
        await page.locator('#successUi').waitFor({state:'visible'});
        assert.deepEqual(await page.evaluate(() => window.__uploads), ['good.pdf','bad.pdf','bad.pdf']);
        const rows = await page.evaluate(() => window.__inserts);
        assert.equal(rows.length, 2);
        for (const row of rows) {
            assert.equal(row.subject, 'EE 201');
            assert.equal(row.note, 'Student reference');
            assert.equal(row.status, 'pending');
            assert.equal(row.file_type, 'pdf');
            assert.match(row.file_path, /^pending\//);
        }
        assert.equal(await page.locator('#uploadProgress').getAttribute('aria-valuenow'), '100');
        await page.locator('#closeSuccessBtn').click();
        await page.locator('#openUploadBtn').click();
        assert.equal(await page.locator('#subjectInput').inputValue(), '');
        assert.equal(await page.locator('#uploadModal').getAttribute('aria-labelledby'), 'uploadTitle');
    } finally { await context.close(); }
});

test('failed database insert cleans up storage; modal can close during upload', async () => {
    const {page, context} = await pageForTest();
    try {
        await page.evaluate(() => { window.__config = { insertFailure:true, delay:250 }; });
        await openUpload(page);
        await page.locator('#fileInput').setInputFiles(file('reference.pdf'));
        await page.locator('#closeUploadBtn').click();
        assert.equal(await page.locator('#uploadModal').getAttribute('aria-hidden'), 'true');
        await page.waitForFunction(() => window.__removed?.length === 1);
        await page.locator('#openUploadBtn').click();
        await page.locator('#retryUploadBtn').waitFor({state:'visible'});
        await page.locator('#retryUploadBtn').click();
        await page.locator('#successUi').waitFor({state:'visible'});
        assert.equal(await page.evaluate(() => window.__removed.length), 1);
    } finally { await context.close(); }
});

test('SDK failure is recoverable and missing course names never upload', async () => {
    const {page, context} = await pageForTest();
    try {
        let failSdk = true;
        await page.route('**/npm/@supabase/supabase-js@2', route => failSdk ? route.abort() : route.fulfill({contentType:'application/javascript',body:mockSdk}));
        await page.locator('#openUploadBtn').click();
        await page.locator('#fileInput').setInputFiles(file('reference.pdf'));
        assert.equal(await page.locator('script[src*="supabase"]').count(), 0);
        await page.locator('#subjectInput').fill('EE 201');
        await page.locator('#fileInput').setInputFiles(file('reference.pdf'));
        await page.locator('#retryUploadBtn').waitFor({state:'visible'});
        assert.equal(await page.locator('#subjectInput').isEnabled(), true);
        failSdk = false;
        await page.locator('#retryUploadBtn').click();
        await page.locator('#successUi').waitFor({state:'visible'});
    } finally { await context.close(); }
});

test('page works with unavailable localStorage and with reduced motion', async () => {
    const {page, context} = await pageForTest({reducedMotion:'reduce'});
    try {
        await page.addInitScript(() => {
            Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
            Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
        });
        await page.reload({waitUntil:'domcontentloaded'});
        await page.locator('#languageToggle').click();
        assert.equal(await page.locator('html').getAttribute('lang'), 'en');
        assert.equal(await page.locator('.hero-title').evaluate(node => getComputedStyle(node).animationName), 'none');
        await page.locator('#openSidebar').click();
        await page.keyboard.press('Escape');
        await openUpload(page);
        await page.keyboard.press('Escape');
    } finally { await context.close(); }
});

test('readable contrast, complete translations, static fallback and visual previews', async () => {
    const {page, context} = await pageForTest();
    try {
        await page.evaluate(() => document.fonts.ready);
        const screenshotDir = process.env.HOMEPAGE_SCREENSHOTS;
        if (screenshotDir) require('node:fs').mkdirSync(screenshotDir, {recursive:true});
        for (const [language, theme, width] of [['ar','dark',1440],['en','light',1440],['ar','light',390],['en','dark',390]]) {
            await page.setViewportSize({width, height:900});
            if (await page.locator('html').getAttribute('lang') !== language) await page.locator('#languageToggle').click();
            if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#themeToggle').click();
            assert.equal(await page.locator('[data-i18n]').evaluateAll(nodes => nodes.filter(node => !node.textContent.trim() || node.textContent === 'undefined').length), 0);
            const failures = await page.evaluate(() => {
                function luminance(color) {
                    const [r,g,b] = color.match(/[\d.]+/g).slice(0,3).map(Number).map(n => {
                        n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
                    });
                    return .2126*r + .7152*g + .0722*b;
                }
                return [...document.querySelectorAll('body *')].filter(node =>
                    node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]') &&
                    [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim())
                ).flatMap(node => {
                    const style = getComputedStyle(node);
                    if (style.visibility === 'hidden') return [];
                    let background = node;
                    while (background.parentElement && getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)') background = background.parentElement;
                    const foregroundL = luminance(style.color), backgroundL = luminance(getComputedStyle(background).backgroundColor);
                    const ratio = (Math.max(foregroundL, backgroundL) + .05) / (Math.min(foregroundL, backgroundL) + .05);
                    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight) >= 700);
                    return ratio + .01 < (large ? 3 : 4.5) ? [{text:node.textContent.slice(0,40),ratio}] : [];
                });
            });
            assert.deepEqual(failures, [], `Text contrast: ${language}/${theme}/${width}`);
            if (screenshotDir) await page.screenshot({path:require('node:path').join(screenshotDir,`${language}-${theme}-${width}.png`),fullPage:true,animations:'disabled'});
        }
        if (screenshotDir) {
            await page.locator('#openSidebar').click();
            await page.screenshot({path:require('node:path').join(screenshotDir,'mobile-navigation.png'),animations:'disabled'});
            await page.keyboard.press('Escape');
            await openUpload(page);
            await page.screenshot({path:require('node:path').join(screenshotDir,'mobile-upload.png'),animations:'disabled'});
        }
    } finally { await context.close(); }
    const noScript = await browser.newContext({javaScriptEnabled:false});
    try {
        const staticPage = await noScript.newPage();
        await staticPage.goto(base, {waitUntil:'domcontentloaded'});
        assert.match(await staticPage.locator('h1').innerText(), /الهندسة/);
        assert.equal(await staticPage.locator('.primary-link').getAttribute('href'), 'EEflowchart.html');
        assert.equal(await staticPage.locator('a[href="flowcharts.html"]').count(), 1);
    } finally { await noScript.close(); }
});
