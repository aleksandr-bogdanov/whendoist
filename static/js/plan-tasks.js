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
 * 2. Filter tasks: exclude those without clarity, with mismatched due dates
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
    let selectionStart = null;
    let selectionEnd = null;
    let selectionSection = null; // 'prev-day', 'main-day', or 'next-day'
    let selectionDayCalendar = null;
    let selectionOverlay = null;
    let planBtn = null;
    let planHelper = null;
    let currentVisibleCalendar = null;

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
        // Use the existing header button instead of creating a floating one
        planBtn = document.getElementById('plan-day-btn');
        if (planBtn) {
            planBtn.addEventListener('click', handlePlanButtonClick);
        }
    }

    function setupGlobalEventListeners() {
        document.addEventListener('click', handleOutsideClick);
        document.addEventListener('keydown', handleKeyDown);
    }

    function handlePlanButtonClick(e) {
        e.stopPropagation();
        if (isInSelectionMode) {
            exitSelectionMode();
        } else {
            const target = currentVisibleCalendar ||
                document.getElementById('today-calendar') ||
                document.querySelector('.day-calendar');
            if (target) {
                log.info(`Starting plan for ${target.dataset.day}`);
                enterSelectionMode(target);
            }
        }
    }

    function handleOutsideClick(e) {
        if (!isInSelectionMode) return;
        if (e.target.closest('.day-calendar') === selectionDayCalendar) return;
        if (e.target.closest('#plan-day-btn, .plan-helper, .calendar-header')) return;
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
        if (planBtn) planBtn.classList.add('active');

        showPlanHelper();
        attachSelectionHandlers(dayCalendar);

        log.debug(`Selection mode entered for ${dayCalendar.dataset.day}`);
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
        if (hourRow.classList.contains('prev-day')) {
            selectionSection = 'prev-day';
        } else if (hourRow.classList.contains('next-day')) {
            selectionSection = 'next-day';
        } else {
            selectionSection = 'main-day';
        }

        const hour = parseInt(hourRow.dataset.hour, 10);
        const slotRect = hourSlot.getBoundingClientRect();
        const clickY = e.clientY - slotRect.top;
        const quarterIndex = Math.min(Math.floor((clickY / slotRect.height) * 4), 3);
        const minutes = quarterIndex * 15;

        selectionAnchor = hour * 60 + minutes;
        selectionStart = selectionAnchor;
        selectionEnd = selectionAnchor + MIN_SELECTION_MINUTES;

        createSelectionOverlay();
        updateSelectionOverlay();
    }

    function handleSelectionMove(e) {
        if (!isSelecting) return;

        const hourGrid = selectionDayCalendar.querySelector('.hour-grid');
        if (!hourGrid) return;

        // Get reference row and bounds based on selection section
        const { refRow, minMins, maxMins } = getSectionBounds(hourGrid, selectionSection);
        if (!refRow) return;

        const refOffset = refRow.offsetTop;
        const rowHeight = refRow.offsetHeight;

        const gridRect = hourGrid.getBoundingClientRect();
        const moveY = e.clientY - gridRect.top + hourGrid.scrollTop;

        // Calculate minutes relative to reference row
        const adjustedY = moveY - refOffset;
        const refHour = parseInt(refRow.dataset.hour, 10);
        const totalMins = refHour * 60 + (adjustedY / rowHeight) * 60;
        const roundedMins = Math.round(totalMins / 15) * 15;
        const clampedMins = Math.max(minMins, Math.min(roundedMins, maxMins));

        // Support bidirectional selection
        if (clampedMins >= selectionAnchor) {
            selectionStart = selectionAnchor;
            selectionEnd = Math.max(clampedMins, selectionAnchor + MIN_SELECTION_MINUTES);
        } else {
            selectionStart = Math.min(clampedMins, selectionAnchor - MIN_SELECTION_MINUTES);
            selectionEnd = selectionAnchor + MIN_SELECTION_MINUTES;
        }

        // Clamp to section bounds
        selectionStart = Math.max(minMins, selectionStart);
        selectionEnd = Math.min(maxMins, selectionEnd);

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
        if (hourRow.classList.contains('prev-day')) {
            selectionSection = 'prev-day';
        } else if (hourRow.classList.contains('next-day')) {
            selectionSection = 'next-day';
        } else {
            selectionSection = 'main-day';
        }

        const hour = parseInt(hourRow.dataset.hour, 10);
        const slotRect = hourSlot.getBoundingClientRect();
        const touchY = touch.clientY - slotRect.top;
        const quarterIndex = Math.min(Math.floor((touchY / slotRect.height) * 4), 3);
        const minutes = quarterIndex * 15;

        selectionAnchor = hour * 60 + minutes;
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

        // Get reference row and bounds based on selection section
        const { refRow, minMins, maxMins } = getSectionBounds(hourGrid, selectionSection);
        if (!refRow) return;

        const refOffset = refRow.offsetTop;
        const rowHeight = refRow.offsetHeight;

        const gridRect = hourGrid.getBoundingClientRect();
        const touchY = touch.clientY - gridRect.top + hourGrid.scrollTop;

        // Calculate minutes relative to reference row
        const adjustedY = touchY - refOffset;
        const refHour = parseInt(refRow.dataset.hour, 10);
        const totalMins = refHour * 60 + (adjustedY / rowHeight) * 60;
        const roundedMins = Math.round(totalMins / 15) * 15;
        const clampedMins = Math.max(minMins, Math.min(roundedMins, maxMins));

        // Support bidirectional selection
        if (clampedMins >= selectionAnchor) {
            selectionStart = selectionAnchor;
            selectionEnd = Math.max(clampedMins, selectionAnchor + MIN_SELECTION_MINUTES);
        } else {
            selectionStart = Math.min(clampedMins, selectionAnchor - MIN_SELECTION_MINUTES);
            selectionEnd = selectionAnchor + MIN_SELECTION_MINUTES;
        }

        // Clamp to section bounds
        selectionStart = Math.max(minMins, selectionStart);
        selectionEnd = Math.min(maxMins, selectionEnd);

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

        // Find the actual row element for the start hour based on section
        const startHour = Math.floor(selectionStart / 60);
        const startMinutes = selectionStart % 60;

        let startRow;
        if (selectionSection === 'prev-day') {
            startRow = hourGrid.querySelector(`.hour-row.prev-day[data-hour="${startHour}"]`);
        } else if (selectionSection === 'next-day') {
            startRow = hourGrid.querySelector(`.hour-row.next-day[data-hour="${startHour}"]`);
        } else {
            startRow = hourGrid.querySelector(`.hour-row[data-hour="${startHour}"]:not(.adjacent-day)`);
        }

        if (!startRow) return;

        // Get actual row height from DOM (accounts for borders, etc.)
        const rowHeight = startRow.offsetHeight;

        // Calculate position: row's top + offset within the hour
        const topPx = startRow.offsetTop + (startMinutes / 60) * rowHeight;

        // Calculate height based on duration
        const duration = selectionEnd - selectionStart;
        const heightPx = (duration / 60) * rowHeight;

        selectionOverlay.style.top = `${topPx}px`;
        selectionOverlay.style.height = `${heightPx}px`;

        const existingBtn = selectionOverlay.querySelector('.plan-tasks-btn');
        selectionOverlay.innerHTML = `<span class="time-selection-range">${formatTime(selectionStart)} - ${formatTime(selectionEnd)}</span>`;
        if (existingBtn) selectionOverlay.appendChild(existingBtn);
    }

    function removeSelectionOverlay() {
        if (selectionOverlay) {
            selectionOverlay.remove();
            selectionOverlay = null;
        }
        selectionAnchor = null;
        selectionStart = null;
        selectionEnd = null;
        selectionSection = null;
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
     */
    function executePlan() {
        if (!selectionDayCalendar || selectionStart === null || selectionEnd === null) {
            log.error('Invalid selection state');
            return;
        }

        // Get the actual date - for adjacent sections, use data-actual-date
        let day = selectionDayCalendar.dataset.day;
        if (selectionSection === 'prev-day' || selectionSection === 'next-day') {
            const hourGrid = selectionDayCalendar.querySelector('.hour-grid');
            const sectionRow = hourGrid?.querySelector(`.hour-row.${selectionSection}`);
            if (sectionRow?.dataset.actualDate) {
                day = sectionRow.dataset.actualDate;
            }
        }

        const tasks = collectEligibleTasks(day);

        if (tasks.length === 0) {
            log.warn('No eligible tasks to schedule');
            exitSelectionMode();
            return;
        }

        const occupiedSlots = collectOccupiedSlots(selectionDayCalendar);
        const targetRange = { startMins: selectionStart, endMins: selectionEnd };

        const scheduled = currentStrategy.schedule(tasks, occupiedSlots, targetRange);
        log.info(`Scheduled ${scheduled.length}/${tasks.length} tasks`);

        for (const item of scheduled) {
            placeTaskOnCalendar(item, day, selectionDayCalendar);
        }

        exitSelectionMode();
    }

    /**
     * Collect tasks eligible for scheduling.
     * Filters by: clarity tag, energy level, visibility, due date match.
     * @param {string} targetDay - Target day in YYYY-MM-DD format
     * @returns {Task[]} Eligible tasks
     */
    function collectEligibleTasks(targetDay) {
        const energyLevel = parseInt(document.body.dataset.energyLevel || '2', 10);
        const tasks = [];
        const candidates = document.querySelectorAll('.task-item[draggable="true"]:not(.scheduled)');

        log.debug(`Evaluating ${candidates.length} candidate tasks`);

        for (const el of candidates) {
            const clarity = el.dataset.clarity || 'none';
            const dueDate = el.dataset.dueDate || '';
            const content = el.querySelector('.task-text')?.textContent?.trim() || '';

            // Skip tasks without clarity tag
            if (clarity === 'none') {
                log.debug(`Skip "${content.slice(0, 25)}": no clarity`);
                continue;
            }

            // Energy level filtering
            if (energyLevel === 1 && clarity !== 'executable') {
                log.debug(`Skip "${content.slice(0, 25)}": ${clarity} != executable`);
                continue;
            }
            if (energyLevel === 2 && clarity === 'exploratory') {
                log.debug(`Skip "${content.slice(0, 25)}": exploratory in normal mode`);
                continue;
            }

            // CSS visibility check
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.opacity === '0') {
                continue;
            }

            // Due date filtering: only schedule on matching day
            if (dueDate && dueDate !== targetDay) {
                log.debug(`Skip "${content.slice(0, 25)}": due ${dueDate} != ${targetDay}`);
                continue;
            }

            const priority = el.classList.contains('impact-4') ? 4 :
                el.classList.contains('impact-3') ? 3 :
                    el.classList.contains('impact-2') ? 2 : 1;

            tasks.push({
                taskId: el.dataset.taskId,
                content,
                duration: parseInt(el.dataset.duration, 10) || DEFAULT_TASK_DURATION,
                priority,
                clarity,
                dueDate,
                isRecurring: el.dataset.isRecurring === 'true',
                hasMatchingDate: dueDate === targetDay,
            });

            log.debug(`Include "${content.slice(0, 25)}": ${tasks[tasks.length - 1].duration}min`);
        }

        return tasks;
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
     * Place a scheduled task on the calendar.
     * @param {ScheduledTask} item - Scheduled task with timing
     * @param {string} day - Day string
     * @param {Element} dayCalendar - Calendar element
     */
    function placeTaskOnCalendar(item, day, dayCalendar) {
        const hour = Math.floor(item.startMins / 60);
        const minutes = item.startMins % 60;
        const { task } = item;

        // Find the correct hour row based on section
        let hourRow;
        if (selectionSection === 'prev-day') {
            hourRow = dayCalendar.querySelector(`.hour-row.prev-day[data-hour="${hour}"]`);
        } else if (selectionSection === 'next-day') {
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

        // Create and place element
        if (typeof createScheduledTaskElement !== 'function') {
            log.error('createScheduledTaskElement not available');
            return;
        }

        const element = createScheduledTaskElement(
            task.taskId, task.content, task.duration, hour, minutes, task.clarity
        );
        hourSlot.appendChild(element);

        // Update state
        if (typeof scheduledTasks !== 'undefined') {
            scheduledTasks.set(task.taskId, { day, hour, minutes, element });
        }

        const originalTask = document.querySelector(`.task-item[data-task-id="${task.taskId}"]`);
        if (originalTask) originalTask.classList.add('scheduled');

        if (typeof recalculateOverlaps === 'function') recalculateOverlaps(dayCalendar);
        if (typeof updateCommitBar === 'function') updateCommitBar();
    }

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    window.PlanTasks = {
        init,
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
 * @property {string} taskId - Todoist task ID
 * @property {string} content - Task content/title
 * @property {number} duration - Duration in minutes
 * @property {number} priority - Priority (1-4, 4=highest)
 * @property {string} clarity - Clarity level (executable|defined|exploratory)
 * @property {string} dueDate - Due date (YYYY-MM-DD) or empty
 * @property {boolean} isRecurring - Whether task is recurring
 * @property {boolean} hasMatchingDate - Whether due date matches target day
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
