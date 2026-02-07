/**
 * Plan Tasks Module
 *
 * Provides auto-scheduling of tasks into a selected time range.
 * Uses Strategy pattern for pluggable scheduling algorithms.
 *
 * @module PlanTasks
 * @description Click "Plan" button, then drag to select time range for scheduling.
 *
 * Algorithm (Smart Strategy):
 * 1. Collect visible unscheduled tasks matching energy filter
 * 2. Filter tasks: exclude those with mismatched energy level or due dates
 * 3. Sort tasks: date-matched first, then smaller duration, then higher priority
 * 4. Find free slots within selection (gaps between calendar events)
 * 5. Greedy bin-packing: place tasks into slots, skip if doesn't fit
 */
(function () {
    'use strict';

    // ==========================================================================
    // CONFIGURATION
    // ==========================================================================

    /** Enable verbose debug logging (set to true for development) */
    const DEBUG = false;

    const LOG_PREFIX = '[Plan]';

    const log = {
        info: (...args) => console.log(LOG_PREFIX, ...args),
        debug: (...args) => DEBUG && console.debug(LOG_PREFIX, ...args),
        warn: (...args) => console.warn(LOG_PREFIX, ...args),
        error: (...args) => console.error(LOG_PREFIX, ...args),
        group: (label) => DEBUG && console.group(`${LOG_PREFIX} ${label}`),
        groupEnd: () => DEBUG && console.groupEnd(),
    };

    // ==========================================================================
    // CONSTANTS
    // ==========================================================================

    const HOUR_HEIGHT_PX_DESKTOP = 60;
    const HOUR_HEIGHT_PX_MOBILE = 40;
    const FIRST_HOUR = 0;
    const MIN_SELECTION_MINUTES = 15;
    const DEFAULT_TASK_DURATION = 30;

    /**
     * Get the current hour height based on screen size.
     * Matches CSS media query: (max-width: 900px), (orientation: portrait)
     * @returns {number} Height in pixels
     */
    function getHourHeight() {
        const isMobile = window.matchMedia('(max-width: 900px), (orientation: portrait)').matches;
        return isMobile ? HOUR_HEIGHT_PX_MOBILE : HOUR_HEIGHT_PX_DESKTOP;
    }

    // ==========================================================================
    // SCHEDULING STRATEGY
    // ==========================================================================

    /**
     * Smart scheduling strategy.
     *
     * Prioritization:
     * 1. Tasks with due date matching target day (highest priority)
     * 2. Smaller duration tasks (prevents pile-up)
     * 3. Higher Todoist priority (P4 > P3 > P2 > P1)
     *
     * Uses greedy bin-packing: fills available slots with tasks that fit,
     * skipping tasks that are too large for remaining slot space.
     *
     * @type {SchedulingStrategy}
     */
    const SmartStrategy = {
        name: 'smart',

        /**
         * Schedule tasks into available time slots.
         * @param {Task[]} tasks - Tasks to schedule
         * @param {TimeSlot[]} occupiedSlots - Already occupied time slots
         * @param {TimeRange} targetRange - Selected time range
         * @returns {ScheduledTask[]} Tasks with assigned start/end times
         */
        schedule(tasks, occupiedSlots, targetRange) {
            const sortedTasks = [...tasks].sort((a, b) => {
                // 1. Tasks with matching due date first
                if (a.hasMatchingDate && !b.hasMatchingDate) return -1;
                if (!a.hasMatchingDate && b.hasMatchingDate) return 1;

                // 2. Smaller duration first (prevents small task pile-up)
                if (a.duration !== b.duration) return a.duration - b.duration;

                // 3. Higher priority (4=highest, 1=lowest in Todoist)
                return b.priority - a.priority;
            });

            const freeSlots = this._findFreeSlots(occupiedSlots, targetRange);
            if (freeSlots.length === 0) return [];

            const scheduled = [];
            let slotIndex = 0;
            let currentPosition = freeSlots[0].startMins;

            for (const task of sortedTasks) {
                if (slotIndex >= freeSlots.length) break;

                const slot = freeSlots[slotIndex];
                const taskDuration = task.duration || DEFAULT_TASK_DURATION;
                const remainingInSlot = slot.endMins - currentPosition;

                if (taskDuration <= remainingInSlot) {
                    scheduled.push({
                        task,
                        startMins: currentPosition,
                        endMins: currentPosition + taskDuration,
                    });
                    currentPosition += taskDuration;

                    // Move to next slot if current is filled
                    if (currentPosition >= slot.endMins) {
                        slotIndex++;
                        if (slotIndex < freeSlots.length) {
                            currentPosition = freeSlots[slotIndex].startMins;
                        }
                    }
                }
                // Skip task if it doesn't fit (greedy bin-packing)
            }

            return scheduled;
        },

        /**
         * Find free time slots within target range.
         * @param {TimeSlot[]} occupiedSlots - Occupied slots
         * @param {TimeRange} targetRange - Target range
         * @returns {TimeSlot[]} Available free slots
         */
        _findFreeSlots(occupiedSlots, targetRange) {
            const sorted = [...occupiedSlots].sort((a, b) => a.startMins - b.startMins);
            const freeSlots = [];
            let currentStart = targetRange.startMins;

            for (const occupied of sorted) {
                if (occupied.endMins <= targetRange.startMins) continue;
                if (occupied.startMins >= targetRange.endMins) break;

                const occStart = Math.max(occupied.startMins, targetRange.startMins);
                const occEnd = Math.min(occupied.endMins, targetRange.endMins);

                if (currentStart < occStart) {
                    freeSlots.push({ startMins: currentStart, endMins: occStart });
                }
                currentStart = Math.max(currentStart, occEnd);
            }

            if (currentStart < targetRange.endMins) {
                freeSlots.push({ startMins: currentStart, endMins: targetRange.endMins });
            }

            return freeSlots;
        },
    };

    // ==========================================================================
    // STRATEGY REGISTRY
    // ==========================================================================

    const strategies = new Map([['smart', SmartStrategy]]);
    let currentStrategy = SmartStrategy;

    /**
     * Register a custom scheduling strategy.
     * @param {SchedulingStrategy} strategy - Strategy object with name and schedule method
     */
    function registerStrategy(strategy) {
        if (!strategy.name || typeof strategy.schedule !== 'function') {
            log.error('Invalid strategy: must have name and schedule method');
            return false;
        }
        strategies.set(strategy.name, strategy);
        return true;
    }

    /**
     * Set the active scheduling strategy.
     * @param {string} name - Strategy name
     * @returns {boolean} Success
     */
    function setStrategy(name) {
        const strategy = strategies.get(name);
        if (!strategy) {
            log.warn(`Unknown strategy: ${name}`);
            return false;
        }
        currentStrategy = strategy;
        log.info(`Strategy set to: ${name}`);
        return true;
    }

    // ==========================================================================
    // SELECTION STATE
    // ==========================================================================

    let isInSelectionMode = false;
    let isSelecting = false;
    let selectionAnchor = null;
    let selectionAnchorSection = null; // Section where selection started
    let selectionStart = null;
    let selectionEnd = null;
    let selectionStartSection = null; // Section containing start time
    let selectionEndSection = null;   // Section containing end time
    let selectionDayCalendar = null;
    let selectionOverlay = null;
    let selectionOverlay2 = null; // Second overlay for cross-day selection
    let planBtn = null;
    let originalBtnText = null;
    let planHelper = null;
    let currentVisibleCalendar = null;

    // Undo state for Plan My Day
    let lastPlanState = null;

    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================

    /**
     * Initialize the Plan Tasks module.
     * Creates Plan button, sets up event listeners, and tracks visible calendar.
     */
    function init() {
        const calendarPanel = document.querySelector('.calendar-panel');
        if (!calendarPanel) {
            log.error('Calendar panel not found');
            return;
        }

        setupCalendarVisibilityTracking();
        createPlanButton(calendarPanel);
        setupGlobalEventListeners();

        log.info('Plan module initialized');
    }

    function setupCalendarVisibilityTracking() {
        const carousel = document.getElementById('calendar-carousel');
        if (!carousel) return;

        const dayCalendars = carousel.querySelectorAll('.day-calendar');
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
                        currentVisibleCalendar = entry.target;
                    }
                }
            },
            { root: carousel, threshold: 0.5 }
        );

        dayCalendars.forEach(day => observer.observe(day));
        currentVisibleCalendar = document.getElementById('today-calendar') || dayCalendars[0];
    }

    function createPlanButton(calendarPanel) {
        // Attach click listeners to all per-day plan buttons
        const planButtons = calendarPanel.querySelectorAll('.plan-day-btn');
        planButtons.forEach(btn => {
            btn.addEventListener('click', handlePlanButtonClick);
        });
    }

    function setupGlobalEventListeners() {
        document.addEventListener('click', handleOutsideClick);
        document.addEventListener('keydown', handleKeyDown);
    }

    function handlePlanButtonClick(e) {
        e.stopPropagation();
        const clickedBtn = e.currentTarget;
        const dayCalendar = clickedBtn.closest('.day-calendar');

        if (isInSelectionMode) {
            // Save reference before exiting (exitSelectionMode sets it to null)
            const wasSelectingCalendar = selectionDayCalendar;
            exitSelectionMode();
            // If clicking a different day's button, start selection on that day
            if (dayCalendar && dayCalendar !== wasSelectingCalendar) {
                planBtn = clickedBtn;
                log.info(`Starting plan for ${dayCalendar.dataset.day}`);
                enterSelectionMode(dayCalendar);
            }
        } else if (dayCalendar) {
            planBtn = clickedBtn;
            log.info(`Starting plan for ${dayCalendar.dataset.day}`);
            enterSelectionMode(dayCalendar);
        }
    }

    function handleOutsideClick(e) {
        if (!isInSelectionMode) return;
        if (e.target.closest('.day-calendar') === selectionDayCalendar) return;
        if (e.target.closest('.plan-day-btn, .plan-helper')) return;
        exitSelectionMode();
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape' && isInSelectionMode) {
            exitSelectionMode();
        }
    }

    // ==========================================================================
    // SELECTION MODE
    // ==========================================================================

    function enterSelectionMode(dayCalendar) {
        if (isInSelectionMode) exitSelectionMode();

        isInSelectionMode = true;
        selectionDayCalendar = dayCalendar;
        dayCalendar.classList.add('selection-mode');
        if (planBtn) {
            planBtn.classList.add('active');
            setPlanButtonToCancel();
        }

        showPlanHelper();
        attachSelectionHandlers(dayCalendar);

        log.debug(`Selection mode entered for ${dayCalendar.dataset.day}`);
    }

    function setPlanButtonToCancel() {
        if (!planBtn) return;
        const nameSpan = planBtn.querySelector('.action-name');
        const emojiSpan = planBtn.querySelector('.action-emoji');
        if (nameSpan) {
            originalBtnText = nameSpan.textContent;
            nameSpan.textContent = 'Cancel';
        }
        if (emojiSpan) {
            emojiSpan.textContent = '✕';
        }
    }

    function restorePlanButton() {
        if (!planBtn) return;
        const nameSpan = planBtn.querySelector('.action-name');
        const emojiSpan = planBtn.querySelector('.action-emoji');
        if (nameSpan && originalBtnText) {
            nameSpan.textContent = originalBtnText;
        }
        if (emojiSpan) {
            emojiSpan.textContent = '✨';
        }
        originalBtnText = null;
    }

    function exitSelectionMode() {
        if (!isInSelectionMode) return;

        isInSelectionMode = false;
        isSelecting = false;

        if (selectionDayCalendar) {
            selectionDayCalendar.classList.remove('selection-mode');
            detachSelectionHandlers(selectionDayCalendar);
        }

        if (planBtn) planBtn.classList.remove('active');
        restorePlanButton();
        hidePlanHelper();
        removeSelectionOverlay();
        selectionDayCalendar = null;

        log.debug('Selection mode exited');
    }

    function attachSelectionHandlers(dayCalendar) {
        const hourGrid = dayCalendar.querySelector('.hour-grid');
        if (hourGrid) {
            // Mouse events
            hourGrid.addEventListener('mousedown', handleSelectionStart);
            hourGrid.addEventListener('mousemove', handleSelectionMove);
            hourGrid.addEventListener('mouseup', handleSelectionEnd);
            // Touch events for mobile
            hourGrid.addEventListener('touchstart', handleTouchStart, { passive: false });
            hourGrid.addEventListener('touchmove', handleTouchMove, { passive: false });
            hourGrid.addEventListener('touchend', handleTouchEnd);
            hourGrid.addEventListener('touchcancel', handleTouchEnd);
        }
    }

    function detachSelectionHandlers(dayCalendar) {
        const hourGrid = dayCalendar.querySelector('.hour-grid');
        if (hourGrid) {
            // Mouse events
            hourGrid.removeEventListener('mousedown', handleSelectionStart);
            hourGrid.removeEventListener('mousemove', handleSelectionMove);
            hourGrid.removeEventListener('mouseup', handleSelectionEnd);
            // Touch events
            hourGrid.removeEventListener('touchstart', handleTouchStart);
            hourGrid.removeEventListener('touchmove', handleTouchMove);
            hourGrid.removeEventListener('touchend', handleTouchEnd);
            hourGrid.removeEventListener('touchcancel', handleTouchEnd);
        }
    }

    // ==========================================================================
    // SELECTION HANDLERS (Mouse)
    // ==========================================================================

    function handleSelectionStart(e) {
        if (!isInSelectionMode) return;

        const hourSlot = e.target.closest('.hour-slot');
        if (!hourSlot) return;

        const hourRow = hourSlot.closest('.hour-row');

        e.preventDefault();
        isSelecting = true;

        // Track which section we're selecting in
        let section;
        if (hourRow.classList.contains('prev-day')) {
            section = 'prev-day';
        } else if (hourRow.classList.contains('next-day')) {
            section = 'next-day';
        } else {
            section = 'main-day';
        }
        selectionAnchorSection = section;
        selectionStartSection = section;
        selectionEndSection = section;

        const hour = parseInt(hourRow.dataset.hour, 10);
        const slotRect = hourSlot.getBoundingClientRect();
        const clickY = e.clientY - slotRect.top;
        const quarterIndex = Math.min(Math.floor((clickY / slotRect.height) * 4), 3);
        const minutes = quarterIndex * 15;

        // Convert to unified time (prev-day: -3*60 to 0, main-day: 0 to 24*60, next-day: 24*60 to 30*60)
        selectionAnchor = sectionTimeToUnified(hour * 60 + minutes, section);
        selectionStart = selectionAnchor;
        selectionEnd = selectionAnchor + MIN_SELECTION_MINUTES;

        createSelectionOverlay();
        updateSelectionOverlay();
    }

    /**
     * Convert section-local time to unified timeline.
     * prev-day (21:00-24:00) -> -180 to 0
     * main-day (0:00-24:00) -> 0 to 1440
     * next-day (0:00-6:00) -> 1440 to 1800
     */
    function sectionTimeToUnified(localMins, section) {
        if (section === 'prev-day') {
            // prev-day shows 21:00-24:00 of yesterday, map to -180 to 0
            return localMins - 24 * 60;
        } else if (section === 'next-day') {
            // next-day shows 0:00-6:00 of tomorrow, map to 1440 to 1800
            return localMins + 24 * 60;
        }
        return localMins; // main-day: 0 to 1440
    }

    /**
     * Convert unified time back to section and local time.
     */
    function unifiedToSectionTime(unifiedMins) {
        if (unifiedMins < 0) {
            return { section: 'prev-day', localMins: unifiedMins + 24 * 60 };
        } else if (unifiedMins >= 24 * 60) {
            return { section: 'next-day', localMins: unifiedMins - 24 * 60 };
        }
        return { section: 'main-day', localMins: unifiedMins };
    }

    function handleSelectionMove(e) {
        if (!isSelecting) return;

        const hourGrid = selectionDayCalendar.querySelector('.hour-grid');
        if (!hourGrid) return;

        // Find which row we're hovering over
        const gridRect = hourGrid.getBoundingClientRect();
        const moveY = e.clientY - gridRect.top + hourGrid.scrollTop;

        // Find the hour row at current Y position
        const hourRows = hourGrid.querySelectorAll('.hour-row');
        let currentRow = null;
        let currentSection = 'main-day';

        for (const row of hourRows) {
            const rowTop = row.offsetTop;
            const rowBottom = rowTop + row.offsetHeight;
            if (moveY >= rowTop && moveY < rowBottom) {
                currentRow = row;
                if (row.classList.contains('prev-day')) {
                    currentSection = 'prev-day';
                } else if (row.classList.contains('next-day')) {
                    currentSection = 'next-day';
                } else {
                    currentSection = 'main-day';
                }
                break;
            }
        }

        if (!currentRow) return;

        const rowHeight = currentRow.offsetHeight;
        const rowTop = currentRow.offsetTop;
        const relativeY = moveY - rowTop;
        const hour = parseInt(currentRow.dataset.hour, 10);
        const localMins = hour * 60 + (relativeY / rowHeight) * 60;
        const roundedMins = Math.round(localMins / 15) * 15;

        // Convert to unified time
        const unifiedMins = sectionTimeToUnified(roundedMins, currentSection);

        // Get global bounds (allow cross-day but not beyond visible range)
        const minUnified = sectionTimeToUnified(21 * 60, 'prev-day'); // -180 (21:00 yesterday)
        const maxUnified = sectionTimeToUnified(6 * 60, 'next-day');  // 1800 (06:00 tomorrow)

        const clampedMins = Math.max(minUnified, Math.min(unifiedMins, maxUnified));

        // Support bidirectional selection
        if (clampedMins >= selectionAnchor) {
            selectionStart = selectionAnchor;
            selectionEnd = Math.max(clampedMins, selectionAnchor + MIN_SELECTION_MINUTES);
        } else {
            selectionStart = Math.min(clampedMins, selectionAnchor - MIN_SELECTION_MINUTES);
            selectionEnd = selectionAnchor + MIN_SELECTION_MINUTES;
        }

        // Clamp to global bounds
        selectionStart = Math.max(minUnified, selectionStart);
        selectionEnd = Math.min(maxUnified, selectionEnd);

        // Update section tracking
        const startInfo = unifiedToSectionTime(selectionStart);
        const endInfo = unifiedToSectionTime(selectionEnd);
        selectionStartSection = startInfo.section;
        selectionEndSection = endInfo.section;

        updateSelectionOverlay();
    }

    /**
     * Get reference row and time bounds for a section.
     */
    function getSectionBounds(hourGrid, section) {
        let refRow, minMins, maxMins;

        if (section === 'prev-day') {
            refRow = hourGrid.querySelector('.hour-row.prev-day[data-hour="21"]');
            minMins = 21 * 60; // 21:00
            maxMins = 24 * 60; // 24:00 (midnight)
        } else if (section === 'next-day') {
            refRow = hourGrid.querySelector('.hour-row.next-day[data-hour="0"]');
            minMins = 0;       // 00:00
            maxMins = 6 * 60;  // 06:00
        } else {
            refRow = hourGrid.querySelector('.hour-row[data-hour="0"]:not(.adjacent-day)');
            minMins = 0;        // 00:00
            maxMins = 24 * 60;  // 24:00
        }

        return { refRow, minMins, maxMins };
    }

    function handleSelectionEnd() {
        if (!isSelecting) return;
        isSelecting = false;

        const duration = selectionEnd - selectionStart;
        if (duration >= MIN_SELECTION_MINUTES) {
            showPlanTasksButton();
            log.info(`Selected ${formatTime(selectionStart)} - ${formatTime(selectionEnd)}`);
        } else {
            removeSelectionOverlay();
        }
    }

    // ==========================================================================
    // SELECTION HANDLERS (Touch)
    // ==========================================================================

    function handleTouchStart(e) {
        if (!isInSelectionMode) return;
        if (e.touches.length !== 1) return;  // Single touch only

        const touch = e.touches[0];
        const hourSlot = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.hour-slot');
        if (!hourSlot) return;

        const hourRow = hourSlot.closest('.hour-row');

        e.preventDefault();  // Prevent scroll while selecting
        isSelecting = true;

        // Track which section we're selecting in
        let section;
        if (hourRow.classList.contains('prev-day')) {
            section = 'prev-day';
        } else if (hourRow.classList.contains('next-day')) {
            section = 'next-day';
        } else {
            section = 'main-day';
        }
        selectionAnchorSection = section;
        selectionStartSection = section;
        selectionEndSection = section;

        const hour = parseInt(hourRow.dataset.hour, 10);
        const slotRect = hourSlot.getBoundingClientRect();
        const touchY = touch.clientY - slotRect.top;
        const quarterIndex = Math.min(Math.floor((touchY / slotRect.height) * 4), 3);
        const minutes = quarterIndex * 15;

        // Convert to unified time
        selectionAnchor = sectionTimeToUnified(hour * 60 + minutes, section);
        selectionStart = selectionAnchor;
        selectionEnd = selectionAnchor + MIN_SELECTION_MINUTES;

        createSelectionOverlay();
        updateSelectionOverlay();

        log.debug(`Touch start at ${formatTime(selectionAnchor)}`);
    }

    function handleTouchMove(e) {
        if (!isSelecting) return;
        if (e.touches.length !== 1) return;

        e.preventDefault();  // Prevent scroll while selecting

        const touch = e.touches[0];
        const hourGrid = selectionDayCalendar.querySelector('.hour-grid');
        if (!hourGrid) return;

        // Find which row we're touching
        const gridRect = hourGrid.getBoundingClientRect();
        const touchY = touch.clientY - gridRect.top + hourGrid.scrollTop;

        // Find the hour row at current Y position
        const hourRows = hourGrid.querySelectorAll('.hour-row');
        let currentRow = null;
        let currentSection = 'main-day';

        for (const row of hourRows) {
            const rowTop = row.offsetTop;
            const rowBottom = rowTop + row.offsetHeight;
            if (touchY >= rowTop && touchY < rowBottom) {
                currentRow = row;
                if (row.classList.contains('prev-day')) {
                    currentSection = 'prev-day';
                } else if (row.classList.contains('next-day')) {
                    currentSection = 'next-day';
                } else {
                    currentSection = 'main-day';
                }
                break;
            }
        }

        if (!currentRow) return;

        const rowHeight = currentRow.offsetHeight;
        const rowTop = currentRow.offsetTop;
        const relativeY = touchY - rowTop;
        const hour = parseInt(currentRow.dataset.hour, 10);
        const localMins = hour * 60 + (relativeY / rowHeight) * 60;
        const roundedMins = Math.round(localMins / 15) * 15;

        // Convert to unified time
        const unifiedMins = sectionTimeToUnified(roundedMins, currentSection);

        // Get global bounds (allow cross-day but not beyond visible range)
        const minUnified = sectionTimeToUnified(21 * 60, 'prev-day'); // -180 (21:00 yesterday)
        const maxUnified = sectionTimeToUnified(6 * 60, 'next-day');  // 1800 (06:00 tomorrow)

        const clampedMins = Math.max(minUnified, Math.min(unifiedMins, maxUnified));

        // Support bidirectional selection
        if (clampedMins >= selectionAnchor) {
            selectionStart = selectionAnchor;
            selectionEnd = Math.max(clampedMins, selectionAnchor + MIN_SELECTION_MINUTES);
        } else {
            selectionStart = Math.min(clampedMins, selectionAnchor - MIN_SELECTION_MINUTES);
            selectionEnd = selectionAnchor + MIN_SELECTION_MINUTES;
        }

        // Clamp to global bounds
        selectionStart = Math.max(minUnified, selectionStart);
        selectionEnd = Math.min(maxUnified, selectionEnd);

        // Update section tracking
        const startInfo = unifiedToSectionTime(selectionStart);
        const endInfo = unifiedToSectionTime(selectionEnd);
        selectionStartSection = startInfo.section;
        selectionEndSection = endInfo.section;

        updateSelectionOverlay();
    }

    function handleTouchEnd(e) {
        if (!isSelecting) return;
        isSelecting = false;

        const duration = selectionEnd - selectionStart;
        if (duration >= MIN_SELECTION_MINUTES) {
            showPlanTasksButton();
            log.info(`Touch selected ${formatTime(selectionStart)} - ${formatTime(selectionEnd)}`);
        } else {
            removeSelectionOverlay();
        }
    }

    // ==========================================================================
    // UI HELPERS
    // ==========================================================================

    function showPlanHelper() {
        if (planHelper) return;
        const panel = document.querySelector('.calendar-panel');
        if (!panel) return;

        planHelper = document.createElement('div');
        planHelper.className = 'plan-helper';
        planHelper.textContent = 'Click and drag to select a time range';
        panel.appendChild(planHelper);
    }

    function hidePlanHelper() {
        if (planHelper) {
            planHelper.remove();
            planHelper = null;
        }
    }

    function createSelectionOverlay() {
        if (selectionOverlay) selectionOverlay.remove();

        selectionOverlay = document.createElement('div');
        selectionOverlay.className = 'time-selection-overlay';

        const hourGrid = selectionDayCalendar.querySelector('.hour-grid');
        if (hourGrid) hourGrid.appendChild(selectionOverlay);
    }

    function updateSelectionOverlay() {
        if (!selectionOverlay) return;

        const hourGrid = selectionDayCalendar.querySelector('.hour-grid');
        if (!hourGrid) return;

        // Convert unified times to section-local times
        const startInfo = unifiedToSectionTime(selectionStart);
        const endInfo = unifiedToSectionTime(selectionEnd);

        // Check if selection spans multiple sections
        const isCrossDay = startInfo.section !== endInfo.section;

        if (isCrossDay) {
            // Render two overlays for cross-day selection
            updateCrossDayOverlays(hourGrid, startInfo, endInfo);
        } else {
            // Single section selection
            updateSingleSectionOverlay(hourGrid, startInfo.section, startInfo.localMins, endInfo.localMins);
            // Hide second overlay if exists
            if (selectionOverlay2) {
                selectionOverlay2.style.display = 'none';
            }
        }

        // Update time display (use local times for display)
        const existingBtn = selectionOverlay.querySelector('.plan-tasks-btn');
        const startDisplay = formatTimeWithDay(selectionStart, startInfo.section);
        const endDisplay = formatTimeWithDay(selectionEnd, endInfo.section);
        selectionOverlay.innerHTML = `<span class="time-selection-range">${startDisplay} - ${endDisplay}</span>`;
        if (existingBtn) selectionOverlay.appendChild(existingBtn);
    }

    function updateSingleSectionOverlay(hourGrid, section, startMins, endMins) {
        const startHour = Math.floor(startMins / 60);
        const startMinutes = startMins % 60;

        let startRow;
        if (section === 'prev-day') {
            startRow = hourGrid.querySelector(`.hour-row.prev-day[data-hour="${startHour}"]`);
        } else if (section === 'next-day') {
            startRow = hourGrid.querySelector(`.hour-row.next-day[data-hour="${startHour}"]`);
        } else {
            startRow = hourGrid.querySelector(`.hour-row[data-hour="${startHour}"]:not(.adjacent-day)`);
        }

        if (!startRow) return;

        const rowHeight = startRow.offsetHeight;
        const topPx = startRow.offsetTop + (startMinutes / 60) * rowHeight;
        const duration = endMins - startMins;
        const heightPx = (duration / 60) * rowHeight;

        selectionOverlay.style.top = `${topPx}px`;
        selectionOverlay.style.height = `${heightPx}px`;
        selectionOverlay.style.display = 'flex';
    }

    function updateCrossDayOverlays(hourGrid, startInfo, endInfo) {
        // First overlay: from start to end of first section
        let firstSectionEnd;
        if (startInfo.section === 'prev-day') {
            firstSectionEnd = 24 * 60; // End at midnight
        } else if (startInfo.section === 'main-day') {
            firstSectionEnd = 24 * 60; // End at midnight (24:00)
        } else {
            firstSectionEnd = 6 * 60; // next-day ends at 06:00
        }

        updateSingleSectionOverlay(hourGrid, startInfo.section, startInfo.localMins, firstSectionEnd);

        // Create second overlay if needed
        if (!selectionOverlay2) {
            selectionOverlay2 = document.createElement('div');
            selectionOverlay2.className = 'time-selection-overlay time-selection-overlay-2';
            hourGrid.appendChild(selectionOverlay2);
        }

        // Second overlay: from start of second section to end
        let secondSectionStart;
        if (endInfo.section === 'next-day') {
            secondSectionStart = 0; // Start at midnight
        } else if (endInfo.section === 'main-day') {
            secondSectionStart = 0;
        } else {
            secondSectionStart = 21 * 60;
        }

        const endHour = Math.floor(secondSectionStart / 60);
        let endRow;
        if (endInfo.section === 'prev-day') {
            endRow = hourGrid.querySelector(`.hour-row.prev-day[data-hour="${endHour}"]`);
        } else if (endInfo.section === 'next-day') {
            endRow = hourGrid.querySelector(`.hour-row.next-day[data-hour="${endHour}"]`);
        } else {
            endRow = hourGrid.querySelector(`.hour-row[data-hour="${endHour}"]:not(.adjacent-day)`);
        }

        if (endRow) {
            const rowHeight = endRow.offsetHeight;
            const topPx = endRow.offsetTop;
            const duration = endInfo.localMins - secondSectionStart;
            const heightPx = (duration / 60) * rowHeight;

            selectionOverlay2.style.top = `${topPx}px`;
            selectionOverlay2.style.height = `${heightPx}px`;
            selectionOverlay2.style.display = 'flex';
        }
    }

    function formatTimeWithDay(unifiedMins, section) {
        const { localMins } = unifiedToSectionTime(unifiedMins);
        const hours = Math.floor(localMins / 60) % 24;
        const mins = localMins % 60;
        const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

        if (section === 'prev-day') {
            return `${timeStr} (yesterday)`;
        } else if (section === 'next-day') {
            return `${timeStr} (tomorrow)`;
        }
        return timeStr;
    }

    function removeSelectionOverlay() {
        if (selectionOverlay) {
            selectionOverlay.remove();
            selectionOverlay = null;
        }
        if (selectionOverlay2) {
            selectionOverlay2.remove();
            selectionOverlay2 = null;
        }
        selectionAnchor = null;
        selectionAnchorSection = null;
        selectionStart = null;
        selectionEnd = null;
        selectionStartSection = null;
        selectionEndSection = null;
    }

    function showPlanTasksButton() {
        if (!selectionOverlay || selectionOverlay.querySelector('.plan-tasks-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'plan-tasks-btn';
        btn.textContent = 'Plan Tasks';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            executePlan();
        });
        selectionOverlay.appendChild(btn);
    }

    function formatTime(totalMins) {
        const hours = Math.floor(totalMins / 60) % 24;
        const mins = totalMins % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }

    // ==========================================================================
    // PLAN EXECUTION
    // ==========================================================================

    /**
     * Execute the planning algorithm on the selected time range.
     * Supports cross-day planning (e.g., 23:00 today to 02:00 tomorrow).
     */
    async function executePlan() {
        if (!selectionDayCalendar || selectionStart === null || selectionEnd === null) {
            log.error('Invalid selection state');
            return;
        }

        const hourGrid = selectionDayCalendar.querySelector('.hour-grid');

        // Get dates for all sections
        const mainDay = selectionDayCalendar.dataset.day;
        const prevDayRow = hourGrid?.querySelector('.hour-row.prev-day');
        const nextDayRow = hourGrid?.querySelector('.hour-row.next-day');
        const prevDay = prevDayRow?.dataset.actualDate || getAdjacentDate(mainDay, -1);
        const nextDay = nextDayRow?.dataset.actualDate || getAdjacentDate(mainDay, 1);

        // Collect tasks - for cross-day, collect from both involved days
        const involvedDays = new Set();
        const startInfo = unifiedToSectionTime(selectionStart);
        const endInfo = unifiedToSectionTime(selectionEnd);

        if (startInfo.section === 'prev-day') involvedDays.add(prevDay);
        if (startInfo.section === 'main-day' || endInfo.section === 'main-day') involvedDays.add(mainDay);
        if (endInfo.section === 'next-day') involvedDays.add(nextDay);

        // Collect tasks from all involved days
        const allTasks = [];
        const seenTaskIds = new Set();
        for (const day of involvedDays) {
            const dayTasks = collectEligibleTasks(day);
            for (const task of dayTasks) {
                if (!seenTaskIds.has(task.taskId)) {
                    allTasks.push(task);
                    seenTaskIds.add(task.taskId);
                }
            }
        }

        if (allTasks.length === 0) {
            log.warn('No eligible tasks to schedule');
            exitSelectionMode();
            return;
        }

        const occupiedSlots = collectOccupiedSlots(selectionDayCalendar);
        const targetRange = { startMins: selectionStart, endMins: selectionEnd };

        const scheduled = currentStrategy.schedule(allTasks, occupiedSlots, targetRange);
        log.info(`Scheduled ${scheduled.length}/${allTasks.length} tasks`);

        // Store original state for undo before making changes
        const originalStates = [];
        for (const item of scheduled) {
            const task = item.task;
            // Get original scheduled date/time from element data
            const taskEl = document.querySelector(`.task-item[data-task-id="${task.taskId}"]`);
            const anytimeEl = document.querySelector(`.date-only-task[data-task-id="${task.taskId}"]`);

            originalStates.push({
                taskId: task.taskId,
                scheduledDate: task.scheduledDate || null,
                scheduledTime: null, // Anytime tasks had no time
                wasScheduled: taskEl?.classList.contains('scheduled') || false,
                wasAnytime: !!anytimeEl,
            });
        }

        // Store for undo
        lastPlanState = {
            originalStates,
            dayCalendar: selectionDayCalendar,
            timestamp: Date.now(),
        };

        // Execute scheduling
        for (const item of scheduled) {
            // Determine which day this task belongs to based on its start time
            const taskInfo = unifiedToSectionTime(item.startMins);
            let taskDay;
            if (taskInfo.section === 'prev-day') {
                taskDay = prevDay;
            } else if (taskInfo.section === 'next-day') {
                taskDay = nextDay;
            } else {
                taskDay = mainDay;
            }
            await placeTaskOnCalendar(item, taskDay, selectionDayCalendar, taskInfo.section);
        }

        // Re-sort task list to ensure proper order (scheduled after unscheduled)
        if (window.TaskSort && typeof window.TaskSort.applySort === 'function') {
            window.TaskSort.applySort();
        }

        exitSelectionMode();

        // Show undo toast if tasks were scheduled
        if (scheduled.length > 0 && typeof Toast !== 'undefined') {
            const taskWord = scheduled.length === 1 ? 'task' : 'tasks';
            Toast.show(`Scheduled ${scheduled.length} ${taskWord}`, {
                onUndo: undoLastPlan,
            });
        }
    }

    /**
     * Undo the last Plan My Day action.
     * Restores tasks to their original scheduled state.
     */
    async function undoLastPlan() {
        if (!lastPlanState) {
            log.warn('No plan state to undo');
            return;
        }

        const { originalStates, dayCalendar } = lastPlanState;
        log.info(`Undoing plan for ${originalStates.length} tasks`);

        for (const state of originalStates) {
            try {
                // Remove ALL scheduled task elements for this task from all calendars
                const scheduledEls = document.querySelectorAll(`.scheduled-task[data-task-id="${state.taskId}"]`);
                scheduledEls.forEach(el => el.remove());

                // Update via API - restore original state
                const payload = {
                    scheduled_date: state.scheduledDate,
                    scheduled_time: state.scheduledTime,
                };

                const response = await fetch(`/api/v1/tasks/${state.taskId}`, {
                    method: 'PUT',
                    headers: window.getCSRFHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(payload),
                });

                if (response.ok) {
                    // Update UI
                    const taskEl = document.querySelector(`.task-item[data-task-id="${state.taskId}"]`);
                    if (taskEl) {
                        taskEl.classList.remove('scheduled');
                        // Clear the scheduled date display and data attribute
                        if (typeof updateTaskScheduledDate === 'function') {
                            updateTaskScheduledDate(taskEl, state.wasAnytime ? state.scheduledDate : null);
                        }
                        // Move task back to unscheduled section with animation
                        if (!state.wasAnytime && typeof moveTaskToUnscheduledSection === 'function') {
                            moveTaskToUnscheduledSection(taskEl);
                        }
                    }

                    // If was anytime, re-create anytime element
                    if (state.wasAnytime && state.scheduledDate) {
                        // Find the anytime banner for that day and add the task back
                        // This requires a page refresh for simplicity
                    }
                } else {
                    log.error(`Failed to restore task ${state.taskId}`);
                }
            } catch (error) {
                log.error(`Failed to undo task ${state.taskId}:`, error);
            }
        }

        // Recalculate overlaps for all day calendars
        if (typeof recalculateOverlaps === 'function') {
            document.querySelectorAll('.day-calendar').forEach(cal => {
                recalculateOverlaps(cal);
            });
        }

        // Re-sort task list to restore proper order
        if (window.TaskSort && typeof window.TaskSort.applySort === 'function') {
            window.TaskSort.applySort();
        }

        // Update commit bar
        if (typeof updateCommitBar === 'function') {
            updateCommitBar();
        }

        lastPlanState = null;

        // Hide the current toast - no need for confirmation
        if (typeof Toast !== 'undefined') {
            Toast.hide();
        }
    }

    /**
     * Get adjacent date string (YYYY-MM-DD).
     */
    function getAdjacentDate(dateStr, offset) {
        const date = new Date(dateStr);
        date.setDate(date.getDate() + offset);
        return date.toISOString().split('T')[0];
    }

    /**
     * Collect tasks eligible for scheduling.
     * Filters by: clarity tag, energy level, visibility, due date match.
     * Includes both task panel items and Anytime banner tasks.
     * @param {string} targetDay - Target day in YYYY-MM-DD format
     * @returns {Task[]} Eligible tasks
     */
    function collectEligibleTasks(targetDay) {
        const energyLevel = parseInt(document.body.dataset.energyLevel || '2', 10);
        const tasks = [];
        const seenTaskIds = new Set();

        // Collect from task panel
        const panelCandidates = document.querySelectorAll('.task-item[draggable="true"]:not(.scheduled)');
        log.debug(`Evaluating ${panelCandidates.length} panel tasks`);

        for (const el of panelCandidates) {
            const task = extractTaskFromElement(el, targetDay, energyLevel, 'panel');
            if (task && !seenTaskIds.has(task.taskId)) {
                tasks.push(task);
                seenTaskIds.add(task.taskId);
            }
        }

        // Collect from Anytime banner for the target day
        const anytimeBanner = selectionDayCalendar?.querySelector(`.date-only-banner[data-day="${targetDay}"]`);
        if (anytimeBanner) {
            const anytimeCandidates = anytimeBanner.querySelectorAll('.date-only-task[draggable="true"]');
            log.debug(`Evaluating ${anytimeCandidates.length} anytime tasks`);

            for (const el of anytimeCandidates) {
                const task = extractTaskFromAnytimeElement(el, targetDay, energyLevel);
                if (task && !seenTaskIds.has(task.taskId)) {
                    tasks.push(task);
                    seenTaskIds.add(task.taskId);
                }
            }
        }

        return tasks;
    }

    /**
     * Extract task data from a task panel element.
     */
    function extractTaskFromElement(el, targetDay, energyLevel, source) {
        const clarity = el.dataset.clarity || 'normal';
        const scheduledDate = el.dataset.scheduledDate || '';
        const content = el.querySelector('.task-text')?.textContent?.trim() || '';

        // Energy level filtering
        if (energyLevel === 1 && clarity !== 'autopilot') {
            log.debug(`Skip "${content.slice(0, 25)}": ${clarity} != autopilot`);
            return null;
        }
        if (energyLevel === 2 && clarity === 'brainstorm') {
            log.debug(`Skip "${content.slice(0, 25)}": brainstorm in normal mode`);
            return null;
        }

        // CSS visibility check
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.opacity === '0') {
            return null;
        }

        // Scheduled date filtering: only schedule on matching day
        if (scheduledDate && scheduledDate !== targetDay) {
            log.debug(`Skip "${content.slice(0, 25)}": scheduled ${scheduledDate} != ${targetDay}`);
            return null;
        }

        const impact = el.dataset.impact || (
            el.classList.contains('impact-1') ? '1' :
            el.classList.contains('impact-2') ? '2' :
            el.classList.contains('impact-3') ? '3' : '4'
        );

        log.debug(`Include "${content.slice(0, 25)}": from ${source}`);

        return {
            taskId: el.dataset.taskId,
            content,
            duration: parseInt(el.dataset.duration, 10) || DEFAULT_TASK_DURATION,
            priority: parseInt(impact, 10),
            impact,
            clarity,
            scheduledDate,
            isRecurring: el.dataset.isRecurring === 'true',
            hasMatchingDate: scheduledDate === targetDay,
        };
    }

    /**
     * Extract task data from an Anytime banner element.
     */
    function extractTaskFromAnytimeElement(el, targetDay, energyLevel) {
        const clarity = el.dataset.clarity || 'normal';
        const content = el.querySelector('.date-only-task-text')?.textContent?.trim() || '';

        // Energy level filtering
        if (energyLevel === 1 && clarity !== 'autopilot') {
            log.debug(`Skip anytime "${content.slice(0, 25)}": ${clarity} != autopilot`);
            return null;
        }
        if (energyLevel === 2 && clarity === 'brainstorm') {
            log.debug(`Skip anytime "${content.slice(0, 25)}": brainstorm in normal mode`);
            return null;
        }

        const impact = el.dataset.impact || '4';

        log.debug(`Include anytime "${content.slice(0, 25)}"`);

        return {
            taskId: el.dataset.taskId,
            content,
            duration: parseInt(el.dataset.duration, 10) || DEFAULT_TASK_DURATION,
            priority: parseInt(impact, 10),
            impact,
            clarity,
            scheduledDate: targetDay,
            isRecurring: false,
            hasMatchingDate: true,
        };
    }

    /**
     * Collect already occupied time slots from calendar.
     * @param {Element} dayCalendar - Day calendar element
     * @returns {TimeSlot[]} Occupied slots
     */
    function collectOccupiedSlots(dayCalendar) {
        const slots = [];
        const selectors = '.calendar-event[data-start-mins], .scheduled-task[data-start-mins]';

        for (const el of dayCalendar.querySelectorAll(selectors)) {
            slots.push({
                startMins: parseInt(el.dataset.startMins, 10),
                endMins: parseInt(el.dataset.endMins, 10),
            });
        }

        return slots;
    }

    /**
     * Place a scheduled task on the calendar and persist to API.
     * @param {ScheduledTask} item - Scheduled task with timing (unified time)
     * @param {string} day - Day string (YYYY-MM-DD)
     * @param {Element} dayCalendar - Calendar element
     * @param {string} section - Section where task should be placed
     */
    async function placeTaskOnCalendar(item, day, dayCalendar, section) {
        // Convert unified time to local time for placement
        const { localMins } = unifiedToSectionTime(item.startMins);
        const hour = Math.floor(localMins / 60);
        const minutes = localMins % 60;
        const { task } = item;

        // Find the correct hour row based on section
        let hourRow;
        if (section === 'prev-day') {
            hourRow = dayCalendar.querySelector(`.hour-row.prev-day[data-hour="${hour}"]`);
        } else if (section === 'next-day') {
            hourRow = dayCalendar.querySelector(`.hour-row.next-day[data-hour="${hour}"]`);
        } else {
            hourRow = dayCalendar.querySelector(`.hour-row[data-hour="${hour}"]:not(.adjacent-day)`);
        }
        const hourSlot = hourRow?.querySelector('.hour-slot');
        if (!hourSlot) return;

        // Remove existing scheduled instance
        if (typeof scheduledTasks !== 'undefined' && scheduledTasks.has(task.taskId)) {
            const prev = scheduledTasks.get(task.taskId);
            prev.element.remove();
            scheduledTasks.delete(task.taskId);
        }

        // Remove from Anytime banner if present (search all calendars)
        const anytimeTask = document.querySelector(`.date-only-task[data-task-id="${task.taskId}"]`);
        if (anytimeTask) {
            anytimeTask.remove();
        }

        // Create and place element
        if (typeof createScheduledTaskElement !== 'function') {
            log.error('createScheduledTaskElement not available');
            return;
        }

        const element = createScheduledTaskElement(
            task.taskId, task.content, task.duration, hour, minutes, task.impact
        );
        hourSlot.appendChild(element);

        // Update state
        if (typeof scheduledTasks !== 'undefined') {
            scheduledTasks.set(task.taskId, { day, hour, minutes, element });
        }

        const originalTask = document.querySelector(`.task-item[data-task-id="${task.taskId}"]`);
        if (originalTask) {
            originalTask.classList.add('scheduled');
            if (typeof updateTaskScheduledDate === 'function') {
                updateTaskScheduledDate(originalTask, day);
            }
            if (typeof moveTaskToScheduledSection === 'function') {
                moveTaskToScheduledSection(originalTask);
            }
        }

        if (typeof recalculateOverlaps === 'function') recalculateOverlaps(dayCalendar);
        if (typeof updateCommitBar === 'function') updateCommitBar();

        // Persist to API
        const scheduledTime = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
        try {
            const response = await fetch(`/api/v1/tasks/${task.taskId}`, {
                method: 'PUT',
                headers: window.getCSRFHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    scheduled_date: day,
                    scheduled_time: scheduledTime,
                }),
            });

            if (response.ok) {
                log.info(`Scheduled ${task.taskId} at ${day} ${hour}:${String(minutes).padStart(2, '0')}`);
            } else {
                log.error(`Failed to schedule task ${task.taskId}`);
                // Remove the optimistic element on failure
                element.remove();
                if (originalTask) originalTask.classList.remove('scheduled');
                if (typeof recalculateOverlaps === 'function') recalculateOverlaps(dayCalendar);
            }
        } catch (error) {
            log.error(`Failed to schedule task ${task.taskId}:`, error);
            element.remove();
            if (originalTask) originalTask.classList.remove('scheduled');
            if (typeof recalculateOverlaps === 'function') recalculateOverlaps(dayCalendar);
        }
    }

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    /**
     * Programmatically enter selection mode on a given day calendar element.
     * Used by the Plan My Day banner to trigger planning without relying on DOM button clicks.
     * @param {Element} dayCalendar - The .day-calendar element to plan
     */
    function enterPlanMode(dayCalendar) {
        if (!dayCalendar) return;
        // Find the plan button for this calendar to track state
        planBtn = dayCalendar.querySelector('.plan-day-btn');
        enterSelectionMode(dayCalendar);
    }

    window.PlanTasks = {
        init,
        enterPlanMode,
        registerStrategy,
        setStrategy,
        getStrategies: () => Array.from(strategies.keys()),
        /** Enable/disable debug logging at runtime */
        setDebug: (enabled) => { /* Would need to make DEBUG mutable */ },
    };

    document.addEventListener('DOMContentLoaded', init);

})();

// ==========================================================================
// TYPE DEFINITIONS (JSDoc)
// ==========================================================================

/**
 * @typedef {Object} Task
 * @property {string} taskId - Task ID
 * @property {string} content - Task content/title
 * @property {number} duration - Duration in minutes
 * @property {number} priority - Priority (1-4, 4=highest)
 * @property {string} clarity - Mode level (autopilot|normal|brainstorm)
 * @property {string} scheduledDate - Scheduled date (YYYY-MM-DD) or empty
 * @property {boolean} isRecurring - Whether task is recurring
 * @property {boolean} hasMatchingDate - Whether scheduled date matches target day
 */

/**
 * @typedef {Object} TimeSlot
 * @property {number} startMins - Start time in minutes from midnight
 * @property {number} endMins - End time in minutes from midnight
 */

/**
 * @typedef {Object} TimeRange
 * @property {number} startMins - Start of range
 * @property {number} endMins - End of range
 */

/**
 * @typedef {Object} ScheduledTask
 * @property {Task} task - The task
 * @property {number} startMins - Scheduled start time
 * @property {number} endMins - Scheduled end time
 */

/**
 * @typedef {Object} SchedulingStrategy
 * @property {string} name - Strategy identifier
 * @property {function(Task[], TimeSlot[], TimeRange): ScheduledTask[]} schedule - Scheduling function
 */
