/**
 * Whendoist Mobile UX Audit - Playwright Script
 * Tests on WebKit (iOS Safari) and Chromium with multiple viewport sizes.
 */
import { chromium, webkit } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SCREENSHOTS_DIR = join(__dirname, 'screenshots');

// Ensure screenshots directory exists
if (!existsSync(SCREENSHOTS_DIR)) mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// MIME types for static server
const MIME = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

// Simple static file server
function startServer(port = 8765) {
    return new Promise((resolve) => {
        const server = createServer(async (req, res) => {
            let filePath = join(PROJECT_ROOT, req.url === '/' ? '/e2e/mobile-audit.html' : req.url);
            // Route /e2e/* to the e2e directory
            if (req.url.startsWith('/e2e/')) {
                filePath = join(PROJECT_ROOT, req.url);
            }
            try {
                const data = await readFile(filePath);
                const ext = extname(filePath);
                res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
                res.end(data);
            } catch {
                res.writeHead(404);
                res.end('Not found: ' + req.url);
            }
        });
        server.listen(port, () => {
            console.log(`Static server on http://localhost:${port}`);
            resolve(server);
        });
    });
}

const VIEWPORTS = [
    { name: 'iPhone15ProMax', width: 430, height: 932 },
    { name: 'iPhoneSE', width: 375, height: 667 },
    { name: 'iPhone14', width: 390, height: 844 },
];

const ENGINES = [
    { name: 'webkit', launcher: webkit },
    { name: 'chromium', launcher: chromium },
];

const findings = [];

function log(msg) {
    console.log(`[AUDIT] ${msg}`);
}

function finding(category, severity, description, viewport, engine, screenshot) {
    const f = { category, severity, description, viewport, engine, screenshot };
    findings.push(f);
    log(`${severity.toUpperCase()} [${category}] ${description} (${viewport}/${engine})${screenshot ? ' -> ' + screenshot : ''}`);
}

async function screenshot(page, name) {
    const path = join(SCREENSHOTS_DIR, `${name}.png`);
    await page.screenshot({ path, fullPage: false });
    return path;
}

// =====================================================================
// AUDIT FUNCTIONS
// =====================================================================

async function auditLayoutOverflow(page, vp, engine) {
    log(`--- Layout & Overflow (${vp.name}/${engine}) ---`);

    // Check for horizontal overflow
    const hasHScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    if (hasHScroll) {
        const s = await screenshot(page, `${engine}-${vp.name}-hscroll`);
        finding('layout', 'bug', 'Horizontal scrollbar detected - content overflows viewport', vp.name, engine, s);
    }

    // Check if body height exceeds viewport (causes scroll issues)
    const bodyOverflow = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        return {
            bodyScrollH: body.scrollHeight,
            htmlScrollH: html.scrollHeight,
            innerH: window.innerHeight,
            overflow: getComputedStyle(html).overflow,
            bodyOverflow: getComputedStyle(body).overflow,
        };
    });
    log(`  Body scroll: ${bodyOverflow.bodyScrollH}px, window: ${bodyOverflow.innerH}px, overflow: ${bodyOverflow.overflow}/${bodyOverflow.bodyOverflow}`);

    // Check tasks panel fills viewport
    const panelBounds = await page.evaluate(() => {
        const panel = document.querySelector('.tasks-panel.mobile-active');
        if (!panel) return null;
        const rect = panel.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height, innerH: window.innerHeight };
    });
    if (panelBounds) {
        if (Math.abs(panelBounds.height - panelBounds.innerH) > 2) {
            finding('layout', 'info', `Tasks panel height (${Math.round(panelBounds.height)}px) != viewport (${panelBounds.innerH}px)`, vp.name, engine);
        }
    }

    // Check site header position and overlap
    const headerInfo = await page.evaluate(() => {
        const header = document.querySelector('.site-header');
        const taskHeader = document.querySelector('.task-list-header');
        if (!header || !taskHeader) return null;
        const hRect = header.getBoundingClientRect();
        const thRect = taskHeader.getBoundingClientRect();
        return {
            headerBottom: hRect.bottom,
            taskHeaderTop: thRect.top,
            overlap: hRect.bottom > thRect.top + 2,
            headerH: hRect.height,
            taskHeaderH: thRect.height,
        };
    });
    if (headerInfo) {
        log(`  Site header: h=${Math.round(headerInfo.headerH)}px, task header top=${Math.round(headerInfo.taskHeaderTop)}px`);
    }

    const s = await screenshot(page, `${engine}-${vp.name}-layout`);
    log(`  Screenshot: ${s}`);
}

async function auditBottomChrome(page, vp, engine) {
    log(`--- Bottom Chrome (${vp.name}/${engine}) ---`);

    // Tab bar measurements
    const tabInfo = await page.evaluate(() => {
        const tabs = document.querySelector('.mobile-tabs');
        if (!tabs) return null;
        const rect = tabs.getBoundingClientRect();
        const tabBtns = document.querySelectorAll('.mobile-tab');
        const addBtn = document.querySelector('.mobile-tab-add');
        const results = {
            tabBarRect: { top: rect.top, bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right },
            tabs: [],
            addBtn: addBtn ? addBtn.getBoundingClientRect() : null,
        };
        tabBtns.forEach(t => {
            const r = t.getBoundingClientRect();
            results.tabs.push({ width: r.width, height: r.height, text: t.textContent.trim() });
        });
        return results;
    });

    if (tabInfo) {
        log(`  Tab bar: h=${Math.round(tabInfo.tabBarRect.height)}px, bottom=${Math.round(tabInfo.tabBarRect.bottom)}px`);
        tabInfo.tabs.forEach((t, i) => {
            log(`  Tab ${i}: ${t.text} - ${Math.round(t.width)}x${Math.round(t.height)}px`);
            if (t.height < 44) {
                finding('bottom-chrome', 'warning', `Tab "${t.text}" height ${Math.round(t.height)}px < 44px min touch target`, vp.name, engine);
            }
        });
        if (tabInfo.addBtn) {
            log(`  Add btn: ${Math.round(tabInfo.addBtn.width)}x${Math.round(tabInfo.addBtn.height)}px`);
        }
    }

    // Energy selector position
    const energyInfo = await page.evaluate(() => {
        const wrapper = document.querySelector('.energy-wrapper');
        if (!wrapper) return null;
        const rect = wrapper.getBoundingClientRect();
        const tabs = document.querySelector('.mobile-tabs');
        const tabRect = tabs ? tabs.getBoundingClientRect() : null;
        const pills = wrapper.querySelectorAll('.energy-pill');
        const pillSizes = [];
        pills.forEach(p => {
            const r = p.getBoundingClientRect();
            pillSizes.push({ width: r.width, height: r.height });
        });
        return {
            rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height },
            tabTop: tabRect ? tabRect.top : null,
            gap: tabRect ? tabRect.top - rect.bottom : null,
            pills: pillSizes,
        };
    });

    if (energyInfo) {
        log(`  Energy: ${Math.round(energyInfo.rect.width)}x${Math.round(energyInfo.rect.height)}px, bottom=${Math.round(energyInfo.rect.bottom)}px`);
        if (energyInfo.gap !== null) {
            log(`  Gap between energy and tabs: ${Math.round(energyInfo.gap)}px`);
            if (energyInfo.gap < 0) {
                finding('bottom-chrome', 'bug', `Energy selector overlaps tab bar by ${Math.abs(Math.round(energyInfo.gap))}px`, vp.name, engine);
            }
        }
        energyInfo.pills.forEach((p, i) => {
            if (p.height < 34) {
                finding('bottom-chrome', 'warning', `Energy pill ${i} height ${Math.round(p.height)}px < 34px`, vp.name, engine);
            }
        });
    }

    // Bottom fade gradient check
    const fadeInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tasks-panel.mobile-active');
        if (!panel) return null;
        const after = getComputedStyle(panel, '::after');
        return {
            position: after.position,
            height: after.height,
            bottom: after.bottom,
            zIndex: after.zIndex,
            pointerEvents: after.pointerEvents,
        };
    });
    if (fadeInfo) {
        log(`  Fade: position=${fadeInfo.position}, height=${fadeInfo.height}, z=${fadeInfo.zIndex}`);
    }

    const s = await screenshot(page, `${engine}-${vp.name}-bottom-chrome`);
    log(`  Screenshot: ${s}`);
}

async function auditTouchTargets(page, vp, engine) {
    log(`--- Touch Targets (${vp.name}/${engine}) ---`);

    const elements = await page.evaluate(() => {
        const selectors = [
            { sel: '.mobile-tab', label: 'Tab button' },
            { sel: '.mobile-tab-add', label: 'Add button' },
            { sel: '.energy-pill', label: 'Energy pill' },
            { sel: '.header-sort', label: 'Sort header' },
            { sel: '.nav-item', label: 'Nav item' },
            { sel: '.gear-btn', label: 'Gear button' },
            { sel: '.day-nav-btn', label: 'Calendar nav' },
            { sel: '.kebab-btn', label: 'Kebab menu' },
            { sel: '.domain-add-btn', label: 'Domain add' },
            { sel: '.plan-day-btn', label: 'Plan day' },
            { sel: '.calendar-quick-action', label: 'Calendar action' },
            { sel: '.complete-gutter', label: 'Complete gutter' },
        ];

        const results = [];
        for (const { sel, label } of selectors) {
            const els = document.querySelectorAll(sel);
            if (els.length === 0) continue;
            // Just check the first one
            const el = els[0];
            const rect = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const display = cs.display;

            // Check for pseudo-element expanding the touch target
            // content:'' computes to '""' in most browsers — only 'none' means no pseudo
            const before = getComputedStyle(el, '::before');
            const hasTouchExpander = before.position === 'absolute' && before.content !== 'none';

            results.push({
                label,
                selector: sel,
                width: rect.width,
                height: rect.height,
                display,
                hidden: display === 'none' || rect.width === 0,
                hasTouchExpander,
            });
        }
        return results;
    });

    for (const el of elements) {
        if (el.hidden) {
            log(`  ${el.label} (${el.selector}): HIDDEN`);
            continue;
        }
        const minDim = Math.min(el.width, el.height);
        const status = minDim >= 44 ? 'OK' : (el.hasTouchExpander ? 'OK (expander)' : 'SMALL');
        log(`  ${el.label}: ${Math.round(el.width)}x${Math.round(el.height)}px ${status}`);
        if (minDim < 44 && !el.hasTouchExpander && !el.hidden) {
            finding('touch-targets', 'warning', `${el.label} (${el.selector}) is ${Math.round(el.width)}x${Math.round(el.height)}px, below 44px min`, vp.name, engine);
        }
    }
}

async function auditTypography(page, vp, engine) {
    log(`--- Typography (${vp.name}/${engine}) ---`);

    const textSizes = await page.evaluate(() => {
        const selectors = [
            '.task-text', '.tab-label', '.nav-item', '.energy-pill',
            '.meta-clarity', '.meta-duration', '.meta-impact',
            '.task-due', '.project-name', '.section-sep-label',
            '.hour-label', '.event-title', '.day-header-date',
            '.header-sort', '.header-domain-label',
        ];
        const results = [];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const cs = getComputedStyle(el);
            results.push({
                sel,
                fontSize: parseFloat(cs.fontSize),
                lineHeight: cs.lineHeight,
                overflow: cs.overflow,
                textOverflow: cs.textOverflow,
                whiteSpace: cs.whiteSpace,
            });
        }
        return results;
    });

    for (const t of textSizes) {
        const flag = t.fontSize < 12 ? ' [SMALL]' : '';
        log(`  ${t.sel}: ${t.fontSize}px${flag}`);
        if (t.fontSize < 10) {
            finding('typography', 'warning', `${t.sel} font-size ${t.fontSize}px is very small`, vp.name, engine);
        }
    }

    // Check task text truncation on long titles
    const truncationCheck = await page.evaluate(() => {
        const longTask = document.querySelector('[data-task-id="202"] .task-text');
        if (!longTask) return null;
        const cs = getComputedStyle(longTask);
        return {
            overflow: cs.overflow,
            textOverflow: cs.textOverflow,
            webkitLineClamp: cs.webkitLineClamp || cs['-webkit-line-clamp'],
            isOverflowing: longTask.scrollHeight > longTask.clientHeight,
            scrollH: longTask.scrollHeight,
            clientH: longTask.clientHeight,
        };
    });
    if (truncationCheck) {
        log(`  Long task truncation: overflow=${truncationCheck.overflow}, clamp=${truncationCheck.webkitLineClamp}, overflowing=${truncationCheck.isOverflowing}`);
    }
}

async function auditCalendar(page, vp, engine) {
    log(`--- Calendar Panel (${vp.name}/${engine}) ---`);

    // Switch to calendar view
    await page.click('.mobile-tab[data-view="schedule"]');
    await page.waitForTimeout(300);

    const calInfo = await page.evaluate(() => {
        const panel = document.querySelector('.calendar-panel');
        const carousel = document.querySelector('.calendar-carousel');
        const dayHeader = document.querySelector('.day-header');
        const navBtns = document.querySelectorAll('.day-nav-btn');
        const hourLabels = document.querySelectorAll('.hour-label');
        const events = document.querySelectorAll('.calendar-event');
        const anytime = document.querySelector('.date-only-banner');

        const results = {
            panelVisible: panel ? getComputedStyle(panel).display !== 'none' : false,
            carouselBounds: carousel ? carousel.getBoundingClientRect() : null,
        };

        if (dayHeader) {
            const r = dayHeader.getBoundingClientRect();
            results.dayHeader = { width: r.width, height: r.height, top: r.top };
        }

        results.navBtns = [];
        navBtns.forEach(btn => {
            const r = btn.getBoundingClientRect();
            const before = getComputedStyle(btn, '::before');
            const hasExpander = before.position === 'absolute' && before.content !== 'none';
            results.navBtns.push({ width: r.width, height: r.height, hasExpander });
        });

        results.hourLabels = [];
        hourLabels.forEach((label, i) => {
            if (i > 3) return; // Just check first few
            const r = label.getBoundingClientRect();
            const cs = getComputedStyle(label);
            results.hourLabels.push({ fontSize: parseFloat(cs.fontSize), left: r.left, width: r.width });
        });

        results.events = [];
        events.forEach(ev => {
            const r = ev.getBoundingClientRect();
            const cs = getComputedStyle(ev);
            results.events.push({ width: r.width, height: r.height, fontSize: parseFloat(cs.fontSize) });
        });

        if (anytime) {
            const r = anytime.getBoundingClientRect();
            results.anytime = { width: r.width, height: r.height, visible: r.height > 0 };
        }

        // Check scroll-snap
        if (carousel) {
            const cs = getComputedStyle(carousel);
            results.scrollSnap = cs.scrollSnapType || cs.webkitScrollSnapType || 'none';
        }

        // Check calendar fade
        const fadeDiv = document.querySelector('.calendar-fade-gradient');
        if (fadeDiv) {
            const cs = getComputedStyle(fadeDiv);
            results.calendarFade = {
                display: cs.display,
                position: cs.position,
                height: cs.height,
            };
        }

        // Check mask-image on carousel
        if (carousel) {
            const cs = getComputedStyle(carousel);
            results.maskImage = cs.webkitMaskImage || cs.maskImage || 'none';
        }

        return results;
    });

    log(`  Panel visible: ${calInfo.panelVisible}`);
    if (calInfo.dayHeader) {
        log(`  Day header: ${Math.round(calInfo.dayHeader.width)}x${Math.round(calInfo.dayHeader.height)}px`);
    }
    calInfo.navBtns.forEach((btn, i) => {
        const status = (btn.width < 44 || btn.height < 44) ? (btn.hasExpander ? 'OK (expander)' : 'SMALL') : 'OK';
        log(`  Nav btn ${i}: ${Math.round(btn.width)}x${Math.round(btn.height)}px ${status}`);
        if ((btn.width < 44 || btn.height < 44) && !btn.hasExpander) {
            finding('calendar', 'warning', `Calendar nav button ${Math.round(btn.width)}x${Math.round(btn.height)}px < 44px`, vp.name, engine);
        }
    });
    calInfo.hourLabels.forEach((h, i) => {
        log(`  Hour label ${i}: ${h.fontSize}px`);
    });
    calInfo.events.forEach((ev, i) => {
        log(`  Event ${i}: ${Math.round(ev.width)}x${Math.round(ev.height)}px, font ${ev.fontSize}px`);
    });
    if (calInfo.anytime) {
        log(`  Anytime section: visible=${calInfo.anytime.visible}, h=${Math.round(calInfo.anytime.height)}px`);
    }
    log(`  Scroll snap: ${calInfo.scrollSnap}`);
    log(`  Mask image: ${calInfo.maskImage ? calInfo.maskImage.substring(0, 60) + '...' : 'none'}`);
    if (calInfo.calendarFade) {
        log(`  Calendar fade: display=${calInfo.calendarFade.display}, position=${calInfo.calendarFade.position}, height=${calInfo.calendarFade.height}`);
    }

    const s = await screenshot(page, `${engine}-${vp.name}-calendar`);
    log(`  Screenshot: ${s}`);

    // Switch back to tasks
    await page.click('.mobile-tab[data-view="tasks"]');
    await page.waitForTimeout(200);
}

async function auditDarkMode(page, vp, engine) {
    log(`--- Dark Mode (${vp.name}/${engine}) ---`);

    // Switch to dark mode
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(200);

    // Check for white/light colors leaking through
    const darkCheck = await page.evaluate(() => {
        const checks = [
            { sel: 'body', prop: 'backgroundColor', label: 'Body bg' },
            { sel: '.task-list-header', prop: 'backgroundColor', label: 'Task header bg' },
            { sel: '.site-header', prop: 'backgroundColor', label: 'Site header bg' },
            { sel: '.task-item', prop: 'backgroundColor', label: 'Task item bg' },
            { sel: '.task-text', prop: 'color', label: 'Task text color' },
            { sel: '.nav-item', prop: 'color', label: 'Nav text color' },
            { sel: '.mobile-tab', prop: 'backgroundColor', label: 'Tab bg' },
            { sel: '.energy-wrapper', prop: 'backgroundColor', label: 'Energy bg' },
            { sel: '.project-header', prop: 'backgroundColor', label: 'Project header bg' },
        ];
        const results = [];
        for (const { sel, prop, label } of checks) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const value = getComputedStyle(el)[prop];
            results.push({ label, value, sel });
        }
        return results;
    });

    for (const c of darkCheck) {
        log(`  ${c.label}: ${c.value}`);
        // Check for pure white backgrounds that would leak in dark mode
        if (c.value === 'rgb(255, 255, 255)' && c.label.includes('bg')) {
            finding('dark-mode', 'bug', `${c.label} is pure white (#fff) in dark mode - likely CSS variable not applied`, vp.name, engine);
        }
    }

    // Check fade gradient in dark mode
    const fadeCheck = await page.evaluate(() => {
        const panel = document.querySelector('.tasks-panel.mobile-active');
        if (!panel) return null;
        const after = getComputedStyle(panel, '::after');
        return { background: after.backgroundImage || after.background };
    });
    if (fadeCheck) {
        log(`  Dark mode fade: ${fadeCheck.background?.substring(0, 80)}`);
    }

    const s = await screenshot(page, `${engine}-${vp.name}-dark`);

    // Check calendar in dark mode
    await page.click('.mobile-tab[data-view="schedule"]');
    await page.waitForTimeout(300);
    const sCal = await screenshot(page, `${engine}-${vp.name}-dark-calendar`);
    await page.click('.mobile-tab[data-view="tasks"]');
    await page.waitForTimeout(200);

    // Switch back to light
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.waitForTimeout(200);
}

async function auditDialog(page, vp, engine) {
    log(`--- Dialog / Bottom Sheet (${vp.name}/${engine}) ---`);

    // Show the bottom sheet
    await page.evaluate(() => {
        document.getElementById('sheet-backdrop').classList.add('visible');
        document.getElementById('bottom-sheet').classList.add('visible');
    });
    await page.waitForTimeout(300);

    const sheetInfo = await page.evaluate(() => {
        const sheet = document.getElementById('bottom-sheet');
        if (!sheet) return null;
        const rect = sheet.getBoundingClientRect();
        const actions = sheet.querySelectorAll('.sheet-action');
        const actionSizes = [];
        actions.forEach(a => {
            const r = a.getBoundingClientRect();
            actionSizes.push({ width: r.width, height: r.height });
        });
        const cancel = sheet.querySelector('.sheet-cancel');
        const cancelRect = cancel ? cancel.getBoundingClientRect() : null;
        return {
            sheetRect: { top: rect.top, bottom: rect.bottom, height: rect.height, width: rect.width },
            actions: actionSizes,
            cancelBtn: cancelRect ? { width: cancelRect.width, height: cancelRect.height } : null,
            innerH: window.innerHeight,
        };
    });

    if (sheetInfo) {
        log(`  Sheet: ${Math.round(sheetInfo.sheetRect.width)}x${Math.round(sheetInfo.sheetRect.height)}px`);
        log(`  Sheet bottom: ${Math.round(sheetInfo.sheetRect.bottom)}px, viewport: ${sheetInfo.innerH}px`);
        if (sheetInfo.sheetRect.bottom > sheetInfo.innerH + 1) {
            finding('dialog', 'bug', `Bottom sheet extends below viewport by ${Math.round(sheetInfo.sheetRect.bottom - sheetInfo.innerH)}px`, vp.name, engine);
        }
        sheetInfo.actions.forEach((a, i) => {
            log(`  Action ${i}: ${Math.round(a.width)}x${Math.round(a.height)}px`);
            if (a.height < 44) {
                finding('dialog', 'warning', `Sheet action ${i} height ${Math.round(a.height)}px < 44px`, vp.name, engine);
            }
        });
        if (sheetInfo.cancelBtn) {
            log(`  Cancel: ${Math.round(sheetInfo.cancelBtn.width)}x${Math.round(sheetInfo.cancelBtn.height)}px`);
        }
    }

    const s = await screenshot(page, `${engine}-${vp.name}-sheet`);

    // Hide sheet
    await page.evaluate(() => {
        document.getElementById('sheet-backdrop').classList.remove('visible');
        document.getElementById('bottom-sheet').classList.remove('visible');
    });
    await page.waitForTimeout(200);

    // Show modal dialog
    await page.evaluate(() => {
        document.getElementById('task-modal').style.display = 'grid';
    });
    await page.waitForTimeout(200);

    const modalInfo = await page.evaluate(() => {
        const modal = document.querySelector('.modal-window');
        if (!modal) return null;
        const rect = modal.getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height,
            top: rect.top,
            bottom: rect.bottom,
            innerH: window.innerHeight,
            innerW: window.innerWidth,
        };
    });

    if (modalInfo) {
        log(`  Modal: ${Math.round(modalInfo.width)}x${Math.round(modalInfo.height)}px`);
        log(`  Modal top: ${Math.round(modalInfo.top)}px, bottom: ${Math.round(modalInfo.bottom)}px`);
        if (modalInfo.bottom > modalInfo.innerH) {
            finding('dialog', 'warning', `Modal extends below viewport by ${Math.round(modalInfo.bottom - modalInfo.innerH)}px`, vp.name, engine);
        }
        if (modalInfo.width > modalInfo.innerW) {
            finding('dialog', 'bug', `Modal wider than viewport (${Math.round(modalInfo.width)}px > ${modalInfo.innerW}px)`, vp.name, engine);
        }
    }

    const sModal = await screenshot(page, `${engine}-${vp.name}-modal`);

    // Hide modal
    await page.evaluate(() => {
        document.getElementById('task-modal').style.display = 'none';
    });
    await page.waitForTimeout(100);
}

async function auditTaskItems(page, vp, engine) {
    log(`--- Task Items (${vp.name}/${engine}) ---`);

    const taskInfo = await page.evaluate(() => {
        const items = document.querySelectorAll('.task-item');
        const results = [];
        items.forEach((item, i) => {
            if (i > 4) return; // Check first 5
            const rect = item.getBoundingClientRect();
            const cs = getComputedStyle(item);

            // Impact rail
            const before = getComputedStyle(item, '::before');
            const hasRail = before.content !== 'none' && before.content !== '' && before.width !== '0px';

            // Swipe peek
            const after = getComputedStyle(item, '::after');
            const hasPeek = after.content !== 'none' && after.content !== '' && after.opacity !== '0';

            // Meta alignment
            const meta = item.querySelector('.task-meta');
            const metaRect = meta ? meta.getBoundingClientRect() : null;

            // Text truncation
            const text = item.querySelector('.task-text');
            const textCs = text ? getComputedStyle(text) : null;

            results.push({
                taskId: item.dataset.taskId,
                width: rect.width,
                height: rect.height,
                hasRail,
                railWidth: before.width,
                hasPeek,
                peekWidth: after.width,
                peekOpacity: after.opacity,
                metaRight: metaRect ? metaRect.right : null,
                itemRight: rect.right,
                textLineClamp: textCs ? (textCs.webkitLineClamp || textCs['-webkit-line-clamp']) : null,
                textOverflow: textCs ? textCs.overflow : null,
                padding: cs.paddingLeft,
            });
        });
        return results;
    });

    for (const item of taskInfo) {
        log(`  Task ${item.taskId}: ${Math.round(item.width)}x${Math.round(item.height)}px, rail=${item.hasRail} (${item.railWidth}), peek=${item.hasPeek} (opacity=${item.peekOpacity})`);
        log(`    Padding-left: ${item.padding}, text clamp: ${item.textLineClamp}, overflow: ${item.textOverflow}`);

        if (item.height < 44) {
            finding('task-items', 'warning', `Task ${item.taskId} height ${Math.round(item.height)}px < 44px min touch target`, vp.name, engine);
        }
    }

    // Check meta column alignment with header
    const alignment = await page.evaluate(() => {
        const headerSorts = document.querySelectorAll('.header-sort');
        const firstTask = document.querySelector('.task-item');
        if (!firstTask || headerSorts.length === 0) return null;

        const metaSpans = firstTask.querySelectorAll('.task-meta > span');
        const results = [];
        headerSorts.forEach((h, i) => {
            const hRect = h.getBoundingClientRect();
            const mSpan = metaSpans[i];
            if (mSpan) {
                const mRect = mSpan.getBoundingClientRect();
                results.push({
                    header: h.dataset.sort,
                    headerCenter: hRect.left + hRect.width / 2,
                    metaCenter: mRect.left + mRect.width / 2,
                    offset: Math.abs((hRect.left + hRect.width / 2) - (mRect.left + mRect.width / 2)),
                });
            }
        });
        return results;
    });

    if (alignment) {
        for (const a of alignment) {
            log(`  Alignment ${a.header}: header center=${Math.round(a.headerCenter)}px, meta center=${Math.round(a.metaCenter)}px, offset=${Math.round(a.offset)}px`);
            if (a.offset > 10) {
                finding('task-items', 'warning', `${a.header} column misaligned by ${Math.round(a.offset)}px between header and task meta`, vp.name, engine);
            }
        }
    }

    const s = await screenshot(page, `${engine}-${vp.name}-tasks`);
}

// =====================================================================
// MAIN
// =====================================================================

async function main() {
    const server = await startServer();
    const URL = 'http://localhost:8765/e2e/mobile-audit.html';

    for (const engineDef of ENGINES) {
        let browser;
        try {
            browser = await engineDef.launcher.launch({ headless: true });
        } catch (err) {
            log(`Failed to launch ${engineDef.name}: ${err.message}`);
            continue;
        }

        for (const vp of VIEWPORTS) {
            log(`\n========== ${engineDef.name} / ${vp.name} (${vp.width}x${vp.height}) ==========`);

            const context = await browser.newContext({
                viewport: { width: vp.width, height: vp.height },
                isMobile: true,
                hasTouch: true,
                deviceScaleFactor: 3,
            });

            const page = await context.newPage();
            await page.goto(URL, { waitUntil: 'networkidle' });
            await page.waitForTimeout(500);

            // Run all audits
            await auditLayoutOverflow(page, vp, engineDef.name);
            await auditBottomChrome(page, vp, engineDef.name);
            await auditTouchTargets(page, vp, engineDef.name);
            await auditTypography(page, vp, engineDef.name);
            await auditCalendar(page, vp, engineDef.name);
            await auditDarkMode(page, vp, engineDef.name);
            await auditDialog(page, vp, engineDef.name);
            await auditTaskItems(page, vp, engineDef.name);

            await context.close();
        }

        await browser.close();
    }

    server.close();

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('AUDIT SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total findings: ${findings.length}`);

    const bugs = findings.filter(f => f.severity === 'bug');
    const warnings = findings.filter(f => f.severity === 'warning');
    const infos = findings.filter(f => f.severity === 'info');

    console.log(`  Bugs: ${bugs.length}`);
    console.log(`  Warnings: ${warnings.length}`);
    console.log(`  Info: ${infos.length}`);

    if (bugs.length > 0) {
        console.log('\nBUGS:');
        bugs.forEach(f => console.log(`  [${f.category}] ${f.description} (${f.viewport}/${f.engine})`));
    }
    if (warnings.length > 0) {
        console.log('\nWARNINGS:');
        warnings.forEach(f => console.log(`  [${f.category}] ${f.description} (${f.viewport}/${f.engine})`));
    }

    // Write findings to JSON
    const { writeFileSync } = await import('fs');
    writeFileSync(join(SCREENSHOTS_DIR, 'findings.json'), JSON.stringify(findings, null, 2));
    console.log(`\nFindings written to ${join(SCREENSHOTS_DIR, 'findings.json')}`);
    console.log(`Screenshots in ${SCREENSHOTS_DIR}`);
}

main().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});
