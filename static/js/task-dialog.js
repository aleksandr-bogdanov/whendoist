/**
 * Task Dialog Module
 *
 * Provides add/edit modal for native tasks.
 * Triggered by: "+" button, click task, keyboard "q"
 */
(function () {
    'use strict';

    let backdropEl = null;
    let modalEl = null;
    let currentTaskId = null;
    let domains = [];

    const DURATION_PRESETS = [15, 30, 60, 120, 240];
    const IMPACT_OPTIONS = [
        { value: 1, label: 'P1', description: 'Life-changing' },
        { value: 2, label: 'P2', description: 'Useful' },
        { value: 3, label: 'P3', description: 'Nice to have' },
        { value: 4, label: 'P4', description: 'Maintenance' },
    ];
    const CLARITY_OPTIONS = [
        { value: 'clear', label: 'Clear', description: 'No-brainer' },
        { value: 'defined', label: 'Def', description: 'Needs focus' },
        { value: 'open', label: 'Open', description: 'Needs thinking' },
    ];
    const RECURRENCE_PRESETS = [
        { value: null, label: 'None', freq: null },
        { value: 'daily', label: 'Daily', freq: 'daily' },
        { value: 'weekly', label: 'Weekly', freq: 'weekly' },
        { value: 'monthly', label: 'Monthly', freq: 'monthly' },
        { value: 'custom', label: 'Custom', freq: null },
    ];

    /**
     * Escape HTML to prevent XSS when inserting user content via innerHTML.
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Format a datetime string to a readable format.
     * e.g. "Jan 5, 2026 at 2:30 PM"
     */
    function formatDateTime(isoString) {
        if (!isoString) return '—';
        const date = new Date(isoString);
        const options = {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        };
        return date.toLocaleString('en-US', options).replace(',', ' at');
    }

    function init() {
        createModal();
        setupEventListeners();
        loadDomains();
    }

    function createModal() {
        backdropEl = document.createElement('div');
        backdropEl.className = 'modal-backdrop';
        backdropEl.setAttribute('data-modal-backdrop', '');
        backdropEl.style.display = 'none';

        backdropEl.innerHTML = `
            <div class="modal-window task-modal" role="dialog" aria-modal="true">
                <form class="task-modal-form" style="display: contents;">
                    <!-- Header -->
                    <div class="modal-hd">
                        <div class="modal-title" id="modal-title-text">New Task</div>
                        <button type="button" class="modal-close-btn" aria-label="Close">&times;</button>
                    </div>

                    <!-- Body -->
                    <div class="modal-body">
                        <!-- Capture Stack (title + description) -->
                        <div class="capture-stack">
                            <input class="capture-field capture-title" name="title" placeholder="Task name" required autofocus spellcheck="false" autocomplete="off">
                            <div class="capture-divider"></div>
                            <textarea class="capture-field capture-desc" name="description" placeholder="Description (optional)" spellcheck="false"></textarea>
                        </div>

                        <!-- SCHEDULING Section -->
                        <div class="modal-section">
                            <div class="section-title">Scheduling</div>
                            <div class="form-grid-2">
                                <div class="form-field">
                                    <div class="field-label">Schedule</div>
                                    <div class="field-controls">
                                        <input type="text" name="scheduled_date" class="input" placeholder="Date" readonly>
                                        <div class="time-picker-wrapper">
                                            <input type="text" name="scheduled_time" class="input input-time" placeholder="Time" readonly>
                                            <div class="time-picker-dropdown" id="scheduled-time-dropdown">
                                                <div class="time-scroller">
                                                    <div class="scroller-column" id="hour-scroller"></div>
                                                    <div class="scroller-separator">:</div>
                                                    <div class="scroller-column" id="minute-scroller"></div>
                                                </div>
                                                <div class="time-picker-actions">
                                                    <button type="button" class="time-clear-btn">Clear</button>
                                                    <button type="button" class="time-confirm-btn">OK</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="form-field">
                                    <div class="field-label">Due</div>
                                    <div class="field-controls">
                                        <input type="text" name="due_date" class="input" placeholder="Date" readonly>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- DETAILS Section (Duration + Impact + Clarity + Repeat) -->
                        <div class="modal-section">
                            <div class="section-title">Details</div>

                            <div class="detail-row">
                                <div class="detail-label">Duration</div>
                                <div class="detail-control duration-control">
                                    <div class="segmented duration-seg">
                                        ${DURATION_PRESETS.map(d =>
                                            `<button type="button" class="seg-btn" data-duration="${d}">${d >= 60 ? d / 60 + 'h' : d + 'm'}</button>`
                                        ).join('')}
                                    </div>
                                    <div class="unit-input">
                                        <input class="input duration-min" name="duration_minutes" inputmode="numeric" min="0" max="1440" step="5">
                                        <span class="unit">min</span>
                                    </div>
                                </div>
                            </div>

                            <div class="detail-row">
                                <div class="detail-label">Impact</div>
                                <div class="detail-control">
                                    <div class="segmented">
                                        ${IMPACT_OPTIONS.map(opt =>
                                            `<button type="button" class="seg-btn" data-impact="${opt.value}" title="${opt.description}">${opt.label}</button>`
                                        ).join('')}
                                    </div>
                                </div>
                            </div>

                            <div class="detail-row">
                                <div class="detail-label">Clarity</div>
                                <div class="detail-control">
                                    <div class="segmented">
                                        ${CLARITY_OPTIONS.map(opt =>
                                            `<button type="button" class="seg-btn" data-clarity="${opt.value}" title="${opt.description}">${opt.label}</button>`
                                        ).join('')}
                                    </div>
                                </div>
                            </div>

                            <div class="detail-row">
                                <div class="detail-label">Repeat</div>
                                <div class="detail-control">
                                    <div class="segmented" id="recurrence-presets">
                                        ${RECURRENCE_PRESETS.map(opt =>
                                            `<button type="button" class="seg-btn" data-recurrence="${opt.value || ''}" data-label="${opt.label}">${opt.label}</button>`
                                        ).join('')}
                                    </div>
                                </div>
                            </div>

                            <div class="subrow" id="custom-recurrence" hidden>
                                <div class="subrow-grid">
                                    <span class="subrow-label">Every</span>
                                    <div class="field-controls">
                                        <input type="number" id="recurrence-interval" class="input input-sm" value="1" min="1" max="99">
                                        <select id="recurrence-freq" class="input">
                                            <option value="daily">days</option>
                                            <option value="weekly">weeks</option>
                                            <option value="monthly">months</option>
                                            <option value="yearly">years</option>
                                        </select>
                                    </div>
                                    <span class="subrow-label">On</span>
                                    <div class="days-row" id="recurrence-days">
                                        <button type="button" class="day-btn" data-day="MO">M</button>
                                        <button type="button" class="day-btn" data-day="TU">T</button>
                                        <button type="button" class="day-btn" data-day="WE">W</button>
                                        <button type="button" class="day-btn" data-day="TH">T</button>
                                        <button type="button" class="day-btn" data-day="FR">F</button>
                                        <button type="button" class="day-btn" data-day="SA">S</button>
                                        <button type="button" class="day-btn" data-day="SU">S</button>
                                    </div>
                                    <span class="subrow-label day-of-month-label" hidden>On day</span>
                                    <div class="field-controls day-of-month-field" hidden>
                                        <input type="number" id="recurrence-day-of-month" class="input input-sm" value="1" min="1" max="31">
                                    </div>
                                </div>
                            </div>

                            <div class="subrow" id="recurrence-bounds" hidden>
                                <div class="subrow-grid">
                                    <span class="subrow-label">Starts</span>
                                    <div class="field-controls">
                                        <input type="text" id="recurrence-start" class="input input-sm" placeholder="Today" readonly>
                                    </div>
                                    <span class="subrow-label">Ends</span>
                                    <div class="field-controls">
                                        <input type="text" id="recurrence-end" class="input input-sm" placeholder="Never" readonly>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- BATCH COMPLETE (visible for recurring tasks with pending past instances) -->
                        <div class="detail-row" id="batch-complete-row" style="display: none;">
                            <div class="detail-label"></div>
                            <div class="detail-control">
                                <button type="button" class="btn btn-secondary btn-sm" id="btn-batch-complete">
                                    Complete past instances
                                </button>
                            </div>
                        </div>

                        <!-- METADATA (compact, only visible for existing tasks) -->
                        <div class="task-metadata" id="metadata-section" style="display: none;">
                            <div class="meta-line" id="meta-created-at"></div>
                            <div class="meta-line" id="meta-completed-row" style="display: none;">
                                <span id="meta-completed-at"></span>
                            </div>
                        </div>
                    </div>

                    <!-- Footer: Domain | Delete | Complete/Reopen | Cancel + Save -->
                    <div class="modal-ft">
                        <div class="ft-left">
                            <div class="domain-dropdown" id="domain-dropdown">
                                <button type="button" class="domain-dropdown-btn" id="domain-dropdown-btn">
                                    <span class="domain-dropdown-text">📥 Inbox</span>
                                    <svg class="domain-dropdown-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
                                        <path d="M1 5L5 1L9 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </button>
                                <div class="domain-dropdown-menu" id="domain-dropdown-menu">
                                    <button type="button" class="domain-dropdown-item" data-value="">📥 Inbox</button>
                                </div>
                            </div>
                            <input type="hidden" name="domain_id" value="">
                        </div>
                        <div class="ft-center">
                            <button type="button" class="btn btn-danger-outline" id="btn-delete" style="display: none;">Delete</button>
                            <button type="button" class="btn btn-complete" id="btn-complete" style="display: none;">
                                <span class="btn-complete-icon">✓</span> Complete
                            </button>
                        </div>
                        <div class="ft-right">
                            <button type="button" class="btn btn-secondary" id="btn-cancel">Cancel</button>
                            <button type="submit" class="btn btn-primary btn-submit">Add task</button>
                        </div>
                    </div>

                    <input type="hidden" name="task_status" value="pending">

                    <input type="hidden" name="impact" value="4">
                    <input type="hidden" name="clarity" value="defined">
                </form>
            </div>
        `;

        document.body.appendChild(backdropEl);
        modalEl = backdropEl.querySelector('.modal-window');
        initializeDatePickers();
    }

    // Air Datepicker instances
    let scheduledDatePicker = null;
    let scheduledTimePicker = null;
    let dueDatePicker = null;
    let recurrenceStartPicker = null;
    let recurrenceEndPicker = null;

    // English locale for Air Datepicker (CDN version defaults to non-English)
    const localeEn = {
        days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        daysMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
        months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        today: 'Today',
        clear: 'Clear',
        dateFormat: 'MMM d, yyyy',
        timeFormat: 'h:mm aa',
        firstDay: 0
    };

    function initializeDatePickers() {
        const dateConfig = {
            locale: localeEn,
            dateFormat: 'yyyy-MM-dd',
            autoClose: true,
            position: 'bottom center',
            container: document.body,
            buttons: ['today', 'clear'],
        };

        scheduledDatePicker = new AirDatepicker(backdropEl.querySelector('[name="scheduled_date"]'), {
            ...dateConfig,
            onSelect: ({date, formattedDate}) => {
                backdropEl.querySelector('[name="scheduled_date"]').dataset.value = formattedDate || '';
            }
        });

        dueDatePicker = new AirDatepicker(backdropEl.querySelector('[name="due_date"]'), {
            ...dateConfig,
            onSelect: ({date, formattedDate}) => {
                backdropEl.querySelector('[name="due_date"]').dataset.value = formattedDate || '';
            }
        });

        recurrenceStartPicker = new AirDatepicker(backdropEl.querySelector('#recurrence-start'), {
            ...dateConfig,
            onSelect: ({date, formattedDate}) => {
                backdropEl.querySelector('#recurrence-start').dataset.value = formattedDate || '';
            }
        });

        recurrenceEndPicker = new AirDatepicker(backdropEl.querySelector('#recurrence-end'), {
            ...dateConfig,
            onSelect: ({date, formattedDate}) => {
                backdropEl.querySelector('#recurrence-end').dataset.value = formattedDate || '';
            }
        });

        // Initialize custom time picker
        initializeTimePicker();
    }

    function initializeTimePicker() {
        const timeInput = backdropEl.querySelector('[name="scheduled_time"]');
        const dropdown = backdropEl.querySelector('#scheduled-time-dropdown');
        const hourScroller = dropdown.querySelector('#hour-scroller');
        const minuteScroller = dropdown.querySelector('#minute-scroller');
        const confirmBtn = dropdown.querySelector('.time-confirm-btn');
        const clearBtn = dropdown.querySelector('.time-clear-btn');

        // Generate hours (00-23)
        hourScroller.innerHTML = Array.from({ length: 24 }, (_, i) =>
            `<div class="scroller-item" data-value="${i}">${i.toString().padStart(2, '0')}</div>`
        ).join('');

        // Generate minutes (00, 05, 10, ... 55)
        minuteScroller.innerHTML = Array.from({ length: 12 }, (_, i) => i * 5).map(m =>
            `<div class="scroller-item" data-value="${m}">${m.toString().padStart(2, '0')}</div>`
        ).join('');

        let selectedHour = 9;
        let selectedMinute = 0;

        function updateSelection() {
            hourScroller.querySelectorAll('.scroller-item').forEach(item => {
                item.classList.toggle('is-selected', parseInt(item.dataset.value) === selectedHour);
            });
            minuteScroller.querySelectorAll('.scroller-item').forEach(item => {
                item.classList.toggle('is-selected', parseInt(item.dataset.value) === selectedMinute);
            });
        }

        function scrollToValue(scroller, value, smooth = true) {
            const item = scroller.querySelector(`.scroller-item[data-value="${value}"]`);
            if (item) {
                scroller.scrollTo({
                    top: item.offsetTop - scroller.offsetHeight / 2 + item.offsetHeight / 2,
                    behavior: smooth ? 'smooth' : 'auto'
                });
            }
        }

        // Find which item is centered in the scroller
        function getCenteredValue(scroller) {
            const scrollerRect = scroller.getBoundingClientRect();
            const centerY = scrollerRect.top + scrollerRect.height / 2;

            let closestItem = null;
            let closestDistance = Infinity;

            scroller.querySelectorAll('.scroller-item').forEach(item => {
                const itemRect = item.getBoundingClientRect();
                const itemCenterY = itemRect.top + itemRect.height / 2;
                const distance = Math.abs(centerY - itemCenterY);

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestItem = item;
                }
            });

            return closestItem ? parseInt(closestItem.dataset.value) : null;
        }

        // Snap to nearest value and select it
        function snapAndSelect(scroller, isHour) {
            const value = getCenteredValue(scroller);
            if (value !== null) {
                if (isHour) {
                    selectedHour = value;
                } else {
                    selectedMinute = value;
                }
                updateSelection();
                scrollToValue(scroller, value);
            }
        }

        // Track if any scroller is being dragged (to prevent close on outside click)
        let isAnyDragging = false;

        // Drag support - snap only on release
        function setupDrag(scroller, isHour) {
            let isDragging = false;
            let startY = 0;
            let startScrollTop = 0;

            scroller.addEventListener('mousedown', (e) => {
                isDragging = true;
                isAnyDragging = true;
                startY = e.clientY;
                startScrollTop = scroller.scrollTop;
                scroller.style.cursor = 'grabbing';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                scroller.scrollTop = startScrollTop + (startY - e.clientY);
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    scroller.style.cursor = '';
                    snapAndSelect(scroller, isHour);
                    // Delay reset to prevent click-outside from firing
                    setTimeout(() => { isAnyDragging = false; }, 10);
                }
            });

            // Touch support
            let touchStartY = 0;
            let touchStartScrollTop = 0;

            scroller.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
                touchStartScrollTop = scroller.scrollTop;
                isAnyDragging = true;
            }, { passive: true });

            scroller.addEventListener('touchmove', (e) => {
                scroller.scrollTop = touchStartScrollTop + (touchStartY - e.touches[0].clientY);
            }, { passive: true });

            scroller.addEventListener('touchend', () => {
                snapAndSelect(scroller, isHour);
                setTimeout(() => { isAnyDragging = false; }, 10);
            }, { passive: true });

            // Also snap on wheel scroll end
            let wheelTimeout = null;
            scroller.addEventListener('wheel', () => {
                clearTimeout(wheelTimeout);
                wheelTimeout = setTimeout(() => snapAndSelect(scroller, isHour), 150);
            }, { passive: true });
        }

        setupDrag(hourScroller, true);
        setupDrag(minuteScroller, false);

        // Click on items (instant select)
        hourScroller.addEventListener('click', (e) => {
            const item = e.target.closest('.scroller-item');
            if (item) {
                selectedHour = parseInt(item.dataset.value);
                updateSelection();
                scrollToValue(hourScroller, selectedHour);
            }
        });

        minuteScroller.addEventListener('click', (e) => {
            const item = e.target.closest('.scroller-item');
            if (item) {
                selectedMinute = parseInt(item.dataset.value);
                updateSelection();
                scrollToValue(minuteScroller, selectedMinute);
            }
        });

        // Confirm button
        confirmBtn.addEventListener('click', () => {
            const value = `${selectedHour.toString().padStart(2, '0')}:${selectedMinute.toString().padStart(2, '0')}`;
            timeInput.value = value;
            timeInput.dataset.value = value;
            dropdown.classList.remove('is-open');
        });

        // Clear button
        clearBtn.addEventListener('click', () => {
            timeInput.value = '';
            timeInput.dataset.value = '';
            dropdown.classList.remove('is-open');
        });

        // Toggle dropdown
        timeInput.addEventListener('click', (e) => {
            e.stopPropagation();
            const wasOpen = dropdown.classList.contains('is-open');
            dropdown.classList.toggle('is-open');

            if (!wasOpen) {
                // Parse current value or default to 09:00
                if (timeInput.dataset.value) {
                    const [h, m] = timeInput.dataset.value.split(':');
                    selectedHour = parseInt(h);
                    selectedMinute = parseInt(m);
                } else {
                    selectedHour = 9;
                    selectedMinute = 0;
                }
                updateSelection();
                setTimeout(() => {
                    scrollToValue(hourScroller, selectedHour, false);
                    scrollToValue(minuteScroller, selectedMinute, false);
                }, 10);
            }
        });

        // Close on outside click (but not if we were dragging)
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.time-picker-wrapper') && !isAnyDragging) {
                dropdown.classList.remove('is-open');
            }
        });
    }

    function setupEventListeners() {
        // Open dialog triggers
        document.addEventListener('click', (e) => {
            // Add task button
            if (e.target.closest('.add-task-btn')) {
                e.preventDefault();
                openDialog();
            }
            // Click on task row (but not on interactive elements)
            const taskItem = e.target.closest('.task-item[data-task-id]');
            if (taskItem && !e.target.closest('a, button, input, .task-checkbox')) {
                e.preventDefault();
                const taskId = parseInt(taskItem.dataset.taskId, 10);
                openDialog(taskId);
            }
            // Click on completion row in analytics
            const completionRow = e.target.closest('.completion-row[data-task-id]');
            if (completionRow) {
                e.preventDefault();
                const taskId = parseInt(completionRow.dataset.taskId, 10);
                openDialog(taskId);
            }
            // Click on scheduled task in calendar (any scheduled task with a task ID)
            const scheduledTask = e.target.closest('.scheduled-task[data-task-id]');
            if (scheduledTask && !e.target.closest('a, button, input')) {
                e.preventDefault();
                const taskId = parseInt(scheduledTask.dataset.taskId, 10);
                if (taskId) {
                    openDialog(taskId);
                }
            }
            // Click on anytime task in calendar
            const anytimeTask = e.target.closest('.date-only-task[data-task-id]');
            if (anytimeTask && !e.target.closest('a, button, input')) {
                e.preventDefault();
                const taskId = parseInt(anytimeTask.dataset.taskId, 10);
                if (taskId) {
                    openDialog(taskId);
                }
            }
            // Click on add-task-row in domain group
            const addTaskRow = e.target.closest('.add-task-row');
            if (addTaskRow) {
                e.preventDefault();
                const domainId = addTaskRow.dataset.domainId;
                openDialog(null, { domainId: domainId || null });
            }
            // Click on "+" button in domain header
            const domainAddBtn = e.target.closest('.domain-add-btn');
            if (domainAddBtn) {
                e.stopPropagation();
                e.preventDefault();
                const domainId = domainAddBtn.dataset.domainId;
                openDialog(null, { domainId: domainId || null });
            }
        });

        // Keyboard shortcut "q" for quick add
        document.addEventListener('keydown', (e) => {
            if (e.key === 'q' && !e.target.matches('input, textarea, select') && !isOpen()) {
                e.preventDefault();
                openDialog();
            }
            // Escape to close
            if (e.key === 'Escape' && isOpen()) {
                closeDialog();
            }
        });

        // Close button
        backdropEl.querySelector('.modal-close-btn').addEventListener('click', closeDialog);

        // Cancel button
        backdropEl.querySelector('#btn-cancel').addEventListener('click', closeDialog);

        // Form submit
        backdropEl.querySelector('form').addEventListener('submit', handleSubmit);

        // Delete, complete, and batch complete buttons
        backdropEl.querySelector('#btn-delete').addEventListener('click', handleDelete);
        backdropEl.querySelector('#btn-complete').addEventListener('click', handleComplete);
        backdropEl.querySelector('#btn-batch-complete').addEventListener('click', handleBatchComplete);

        // Click backdrop to close
        backdropEl.addEventListener('click', (e) => {
            if (e.target === backdropEl) {
                closeDialog();
            }
        });

        // Duration preset buttons
        backdropEl.querySelectorAll('.seg-btn[data-duration]').forEach(btn => {
            btn.addEventListener('click', () => {
                const duration = parseInt(btn.dataset.duration, 10);
                backdropEl.querySelector('[name="duration_minutes"]').value = duration;
                backdropEl.querySelectorAll('.seg-btn[data-duration]').forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');
            });
        });

        // Impact buttons
        backdropEl.querySelectorAll('.seg-btn[data-impact]').forEach(btn => {
            btn.addEventListener('click', () => {
                backdropEl.querySelector('[name="impact"]').value = btn.dataset.impact;
                backdropEl.querySelectorAll('.seg-btn[data-impact]').forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');
            });
        });

        // Clarity buttons
        backdropEl.querySelectorAll('.seg-btn[data-clarity]').forEach(btn => {
            btn.addEventListener('click', () => {
                const currentVal = backdropEl.querySelector('[name="clarity"]').value;
                if (currentVal === btn.dataset.clarity) {
                    backdropEl.querySelector('[name="clarity"]').value = '';
                    btn.classList.remove('is-active');
                } else {
                    backdropEl.querySelector('[name="clarity"]').value = btn.dataset.clarity;
                    backdropEl.querySelectorAll('.seg-btn[data-clarity]').forEach(b => b.classList.remove('is-active'));
                    btn.classList.add('is-active');
                }
            });
        });

        // Recurrence preset buttons
        backdropEl.querySelectorAll('#recurrence-presets .seg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const value = btn.dataset.recurrence;
                backdropEl.querySelectorAll('#recurrence-presets .seg-btn').forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');

                const customPanel = backdropEl.querySelector('#custom-recurrence');
                const boundsPanel = backdropEl.querySelector('#recurrence-bounds');
                if (value === 'custom') {
                    customPanel.hidden = false;
                    boundsPanel.hidden = false;
                    updateRecurrenceRule();
                } else {
                    customPanel.hidden = true;
                    // Store as JSON object or empty string
                    if (value && value !== '') {
                        boundsPanel.hidden = false;
                        const rule = { freq: value, interval: 1 };
                        // For "Weekly", default to today's day of week
                        if (value === 'weekly') {
                            const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
                            rule.days_of_week = [dayMap[new Date().getDay()]];
                        }
                        setRecurrenceRule(rule);
                    } else {
                        boundsPanel.hidden = true;
                        setRecurrenceRule(null);
                    }
                }
            });
        });

        // Custom recurrence controls
        backdropEl.querySelector('#recurrence-interval').addEventListener('input', updateRecurrenceRule);
        backdropEl.querySelector('#recurrence-freq').addEventListener('change', () => {
            const freq = backdropEl.querySelector('#recurrence-freq').value;
            const daysRow = backdropEl.querySelector('#recurrence-days');
            const onLabel = backdropEl.querySelector('.subrow-grid > .subrow-label:nth-of-type(2)');
            const domLabel = backdropEl.querySelector('.day-of-month-label');
            const domField = backdropEl.querySelector('.day-of-month-field');

            // Show days-of-week row only for weekly
            if (daysRow) daysRow.hidden = freq !== 'weekly';
            if (onLabel) onLabel.hidden = freq !== 'weekly';
            // Show day-of-month only for monthly
            if (domLabel) domLabel.hidden = freq !== 'monthly';
            if (domField) domField.hidden = freq !== 'monthly';

            updateRecurrenceRule();
        });
        backdropEl.querySelector('#recurrence-day-of-month').addEventListener('input', updateRecurrenceRule);

        // Day buttons for weekly recurrence
        backdropEl.querySelectorAll('#recurrence-days .day-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('is-active');
                updateRecurrenceRule();
            });
        });

        // Domain dropdown
        backdropEl.querySelector('#domain-dropdown-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDomainDropdown();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#domain-dropdown')) {
                closeDomainDropdown();
            }
        });

        // Initial domain items click handlers
        backdropEl.querySelectorAll('.domain-dropdown-item').forEach(item => {
            item.addEventListener('click', () => selectDomain(item.dataset.value, item.textContent));
        });
    }

    // Store recurrence rule as object
    let currentRecurrenceRule = null;

    function setRecurrenceRule(rule) {
        currentRecurrenceRule = rule;
    }

    function getRecurrenceRule() {
        return currentRecurrenceRule;
    }

    function updateRecurrenceRule() {
        const interval = parseInt(backdropEl.querySelector('#recurrence-interval').value, 10) || 1;
        const freq = backdropEl.querySelector('#recurrence-freq').value;

        // Start from existing rule to preserve fields the UI doesn't expose
        // (e.g., week_of_month, month_of_year)
        const base = currentRecurrenceRule || {};
        const rule = { ...base, freq, interval };

        // Clean up freq-specific fields when freq changes
        if (freq !== 'weekly') {
            delete rule.days_of_week;
        }
        if (freq !== 'monthly') {
            delete rule.day_of_month;
            delete rule.week_of_month;
        }
        if (freq !== 'yearly') {
            delete rule.month_of_year;
            if (freq !== 'monthly') {
                delete rule.day_of_month;
            }
        }

        if (freq === 'weekly') {
            const days = Array.from(backdropEl.querySelectorAll('#recurrence-days .day-btn.is-active'))
                .map(btn => btn.dataset.day);
            if (days.length > 0) {
                rule.days_of_week = days;
            } else {
                delete rule.days_of_week;
            }
        }

        if (freq === 'monthly') {
            const dayInput = backdropEl.querySelector('#recurrence-day-of-month');
            if (dayInput) {
                const val = parseInt(dayInput.value, 10);
                if (val >= 1 && val <= 31) {
                    rule.day_of_month = val;
                }
            }
        }

        setRecurrenceRule(rule);
    }

    function isOpen() {
        return backdropEl && backdropEl.style.display !== 'none';
    }

    async function loadDomains() {
        try {
            const response = await fetch('/api/v1/domains');
            if (response.ok) {
                domains = await response.json();

                // Decrypt domain names if encryption is enabled
                if (Crypto.canCrypto()) {
                    for (const domain of domains) {
                        domain.name = await Crypto.decryptField(domain.name);
                    }
                }

                updateDomainSelect();
            }
        } catch (err) {
            console.error('Failed to load domains:', err);
        }
    }

    function updateDomainSelect() {
        const menu = backdropEl.querySelector('#domain-dropdown-menu');
        menu.innerHTML = '<button type="button" class="domain-dropdown-item" data-value="">📥 Inbox</button>' +
            domains.map(d => `<button type="button" class="domain-dropdown-item" data-value="${d.id}">${escapeHtml(d.icon) || '📁'} ${escapeHtml(d.name)}</button>`).join('');

        // Re-attach click handlers
        menu.querySelectorAll('.domain-dropdown-item').forEach(item => {
            item.addEventListener('click', () => selectDomain(item.dataset.value, item.textContent));
        });
    }

    function selectDomain(value, text) {
        backdropEl.querySelector('[name="domain_id"]').value = value;
        backdropEl.querySelector('.domain-dropdown-text').textContent = text;
        closeDomainDropdown();
    }

    function toggleDomainDropdown() {
        const dropdown = backdropEl.querySelector('#domain-dropdown');
        dropdown.classList.toggle('is-open');
    }

    function closeDomainDropdown() {
        const dropdown = backdropEl.querySelector('#domain-dropdown');
        dropdown.classList.remove('is-open');
    }

    async function openDialog(taskId = null, options = {}) {
        currentTaskId = taskId;
        const form = backdropEl.querySelector('form');
        form.reset();

        // Extract options
        const { domainId = null } = options;

        // Update title
        const titleText = backdropEl.querySelector('#modal-title-text');
        titleText.textContent = taskId ? 'Edit Task' : 'New Task';

        // Reset button states
        backdropEl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('is-active'));
        backdropEl.querySelectorAll('.day-btn').forEach(b => b.classList.remove('is-active'));

        // Clear date/time pickers
        if (scheduledDatePicker) scheduledDatePicker.clear();
        if (dueDatePicker) dueDatePicker.clear();
        backdropEl.querySelector('[name="scheduled_date"]').dataset.value = '';
        backdropEl.querySelector('[name="due_date"]').dataset.value = '';

        // Clear time picker
        const timeInput = backdropEl.querySelector('[name="scheduled_time"]');
        timeInput.value = '';
        timeInput.dataset.value = '';

        // Set default impact
        backdropEl.querySelector('[name="impact"]').value = '4';
        backdropEl.querySelector('.seg-btn[data-impact="4"]').classList.add('is-active');

        // Set default clarity to "defined" for new tasks
        backdropEl.querySelector('[name="clarity"]').value = 'defined';
        backdropEl.querySelector('.seg-btn[data-clarity="defined"]')?.classList.add('is-active');

        // Set default recurrence to none
        setRecurrenceRule(null);
        backdropEl.querySelector('.seg-btn[data-recurrence=""]').classList.add('is-active');
        backdropEl.querySelector('#custom-recurrence').hidden = true;
        backdropEl.querySelector('#recurrence-bounds').hidden = true;

        // Clear recurrence bounds pickers
        if (recurrenceStartPicker) recurrenceStartPicker.clear();
        if (recurrenceEndPicker) recurrenceEndPicker.clear();
        backdropEl.querySelector('#recurrence-start').dataset.value = '';
        backdropEl.querySelector('#recurrence-end').dataset.value = '';

        // Reset domain dropdown (or pre-select if domainId provided)
        if (domainId && !taskId) {
            // Pre-select domain for new task
            const domain = domains.find(d => d.id === parseInt(domainId));
            if (domain) {
                backdropEl.querySelector('[name="domain_id"]').value = domain.id;
                backdropEl.querySelector('.domain-dropdown-text').textContent =
                    `${domain.icon || '📁'} ${domain.name}`;
            } else {
                backdropEl.querySelector('[name="domain_id"]').value = '';
                backdropEl.querySelector('.domain-dropdown-text').textContent = '📥 Inbox';
            }
        } else {
            backdropEl.querySelector('[name="domain_id"]').value = '';
            backdropEl.querySelector('.domain-dropdown-text').textContent = '📥 Inbox';
        }
        closeDomainDropdown();

        // Update submit button text
        backdropEl.querySelector('.btn-submit').textContent = taskId ? 'Save' : 'Add task';

        // Hide delete, complete, and batch complete buttons for new tasks
        backdropEl.querySelector('#btn-delete').style.display = 'none';
        backdropEl.querySelector('#batch-complete-row').style.display = 'none';
        const completeBtn = backdropEl.querySelector('#btn-complete');
        completeBtn.style.display = 'none';
        completeBtn.innerHTML = '<span class="btn-complete-icon">✓</span> Complete';
        completeBtn.classList.remove('is-completed');
        backdropEl.querySelector('[name="task_status"]').value = 'pending';

        // Hide metadata section initially
        backdropEl.querySelector('#metadata-section').style.display = 'none';

        // For existing tasks, load data BEFORE showing modal to prevent flicker
        if (taskId) {
            await loadTask(taskId);
        }

        // Show modal and lock scroll
        backdropEl.style.display = 'grid';
        document.body.classList.add('modal-open');
        backdropEl.querySelector('[name="title"]').focus();
    }

    function closeDialog() {
        backdropEl.style.display = 'none';
        document.body.classList.remove('modal-open');
        currentTaskId = null;
    }

    async function loadTask(taskId) {
        try {
            const response = await fetch(`/api/v1/tasks/${taskId}`);
            if (!response.ok) {
                throw new Error('Task not found');
            }
            let task = await response.json();

            // E2E Encryption: Decrypt task data if needed
            if (Crypto.canCrypto()) {
                task.title = await Crypto.decryptField(task.title);
                task.description = await Crypto.decryptField(task.description);
            }

            const form = backdropEl.querySelector('form');
            form.elements.title.value = task.title;
            form.elements.description.value = task.description || '';
            form.elements.domain_id.value = task.domain_id || '';
            form.elements.duration_minutes.value = task.duration_minutes || '';
            form.elements.impact.value = task.impact;
            form.elements.clarity.value = task.clarity || '';

            // Set date values using Air Datepicker
            if (task.scheduled_date && scheduledDatePicker) {
                const date = new Date(task.scheduled_date + 'T00:00:00');
                scheduledDatePicker.selectDate(date);
                form.elements.scheduled_date.dataset.value = task.scheduled_date;
            }
            if (task.due_date && dueDatePicker) {
                const date = new Date(task.due_date + 'T00:00:00');
                dueDatePicker.selectDate(date);
                form.elements.due_date.dataset.value = task.due_date;
            }

            // Set time using custom picker
            if (task.scheduled_time) {
                form.elements.scheduled_time.value = task.scheduled_time;
                form.elements.scheduled_time.dataset.value = task.scheduled_time;
            }

            // Update domain dropdown text
            if (task.domain_id) {
                const domain = domains.find(d => d.id === task.domain_id);
                if (domain) {
                    backdropEl.querySelector('.domain-dropdown-text').textContent = `${domain.icon || '📁'} ${domain.name}`;
                }
            } else {
                backdropEl.querySelector('.domain-dropdown-text').textContent = '📥 Inbox';
            }

            // Update duration buttons
            backdropEl.querySelectorAll('.seg-btn[data-duration]').forEach(btn => {
                btn.classList.toggle('is-active', parseInt(btn.dataset.duration, 10) === task.duration_minutes);
            });

            // Update impact buttons
            backdropEl.querySelectorAll('.seg-btn[data-impact]').forEach(btn => {
                btn.classList.toggle('is-active', parseInt(btn.dataset.impact, 10) === task.impact);
            });

            // Update clarity buttons
            backdropEl.querySelectorAll('.seg-btn[data-clarity]').forEach(btn => {
                btn.classList.toggle('is-active', btn.dataset.clarity === task.clarity);
            });

            // Set recurrence bounds
            if (task.is_recurring) {
                backdropEl.querySelector('#recurrence-bounds').hidden = false;
                if (task.recurrence_start) {
                    const startDate = new Date(task.recurrence_start + 'T00:00:00');
                    if (recurrenceStartPicker) recurrenceStartPicker.selectDate(startDate);
                    backdropEl.querySelector('#recurrence-start').dataset.value = task.recurrence_start;
                }
                if (task.recurrence_end) {
                    const endDate = new Date(task.recurrence_end + 'T00:00:00');
                    if (recurrenceEndPicker) recurrenceEndPicker.selectDate(endDate);
                    backdropEl.querySelector('#recurrence-end').dataset.value = task.recurrence_end;
                }
            }

            // Set recurrence
            if (task.is_recurring) {
                if (task.recurrence_rule) {
                    const rule = task.recurrence_rule;
                    setRecurrenceRule(rule);

                    // Check if it matches a simple preset (freq only, interval 1, no days)
                    const isSimplePreset = rule.interval === 1 && !rule.days_of_week;
                    const presetBtn = isSimplePreset ? backdropEl.querySelector(`#recurrence-presets .seg-btn[data-recurrence="${rule.freq}"]`) : null;

                    if (presetBtn) {
                        backdropEl.querySelectorAll('#recurrence-presets .seg-btn').forEach(b => b.classList.remove('is-active'));
                        presetBtn.classList.add('is-active');
                    } else {
                        // Custom recurrence
                        backdropEl.querySelectorAll('#recurrence-presets .seg-btn').forEach(b => b.classList.remove('is-active'));
                        backdropEl.querySelector('.seg-btn[data-recurrence="custom"]').classList.add('is-active');
                        backdropEl.querySelector('#custom-recurrence').hidden = false;
                        populateCustomRecurrence(rule);
                    }
                } else {
                    // Task is recurring but has no rule (e.g., imported from Todoist)
                    // Show custom as active to indicate it's recurring, but no pattern to show
                    backdropEl.querySelectorAll('#recurrence-presets .seg-btn').forEach(b => b.classList.remove('is-active'));
                    backdropEl.querySelector('.seg-btn[data-recurrence="custom"]').classList.add('is-active');
                    backdropEl.querySelector('#custom-recurrence').hidden = false;
                    // Default to daily if user wants to set a pattern
                    backdropEl.querySelector('#recurrence-freq').value = 'daily';
                    backdropEl.querySelector('#recurrence-interval').value = '1';
                }
            }

            // Show delete and complete buttons for existing tasks
            backdropEl.querySelector('#btn-delete').style.display = 'inline-flex';

            // Show and configure Complete/Reopen button
            const completeBtn = backdropEl.querySelector('#btn-complete');
            completeBtn.style.display = 'inline-flex';

            // Set button state based on task/instance completion
            // For recurring tasks, use today_instance_completed; for regular tasks, use status
            const isCompleted = task.is_recurring
                ? task.today_instance_completed === true
                : task.status === 'completed';
            backdropEl.querySelector('[name="task_status"]').value = task.status || 'pending';
            // Store recurring flag for handleComplete
            completeBtn.dataset.isRecurring = task.is_recurring ? 'true' : 'false';

            if (isCompleted) {
                completeBtn.innerHTML = '<span class="btn-complete-icon">↺</span> Reopen';
                completeBtn.classList.add('is-completed');
            } else {
                completeBtn.innerHTML = '<span class="btn-complete-icon">✓</span> Complete';
                completeBtn.classList.remove('is-completed');
            }

            // Show and populate metadata section
            const metadataSection = backdropEl.querySelector('#metadata-section');
            metadataSection.style.display = 'block';

            // Created at
            backdropEl.querySelector('#meta-created-at').textContent = 'Task created at ' + formatDateTime(task.created_at);

            // Completed at (only show if task is completed)
            const completedRow = backdropEl.querySelector('#meta-completed-row');
            if (isCompleted && task.completed_at) {
                completedRow.style.display = 'block';
                backdropEl.querySelector('#meta-completed-at').textContent = 'Task completed at ' + formatDateTime(task.completed_at);
            } else {
                completedRow.style.display = 'none';
            }

            // Check for pending past instances (async, non-blocking)
            const batchRow = backdropEl.querySelector('#batch-complete-row');
            batchRow.style.display = 'none';
            if (task.is_recurring) {
                fetchPendingPastCount(taskId, batchRow);
            }
        } catch (err) {
            console.error('Failed to load task:', err);
            closeDialog();
        }
    }

    function populateCustomRecurrence(rule) {
        // Populate custom recurrence form from JSON rule object
        if (rule.freq) {
            backdropEl.querySelector('#recurrence-freq').value = rule.freq;
        }
        if (rule.interval) {
            backdropEl.querySelector('#recurrence-interval').value = rule.interval;
        }
        if (rule.days_of_week) {
            backdropEl.querySelectorAll('#recurrence-days .day-btn').forEach(btn => {
                btn.classList.toggle('is-active', rule.days_of_week.includes(btn.dataset.day));
            });
        }
        // Day of month for monthly
        const domInput = backdropEl.querySelector('#recurrence-day-of-month');
        if (domInput && rule.day_of_month) {
            domInput.value = rule.day_of_month;
        }
        // Show/hide freq-dependent rows
        const freq = rule.freq || 'daily';
        const daysRow = backdropEl.querySelector('#recurrence-days');
        const onLabel = backdropEl.querySelector('.subrow-grid > .subrow-label:nth-of-type(2)');
        const domLabel = backdropEl.querySelector('.day-of-month-label');
        const domField = backdropEl.querySelector('.day-of-month-field');
        if (daysRow) daysRow.hidden = freq !== 'weekly';
        if (onLabel) onLabel.hidden = freq !== 'weekly';
        if (domLabel) domLabel.hidden = freq !== 'monthly';
        if (domField) domField.hidden = freq !== 'monthly';
    }

    async function fetchPendingPastCount(taskId, batchRow) {
        try {
            const today = new Date().toISOString().split('T')[0];
            // Fetch pending instances in the past (up to 365 days back)
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 365);
            const startDate = pastDate.toISOString().split('T')[0];

            const response = await fetch(`/api/v1/instances?start_date=${startDate}&end_date=${today}&status=pending`);
            if (response.ok) {
                const instances = await response.json();
                // Filter to this task and only dates before today
                const pastPending = instances.filter(i => i.task_id === taskId && i.instance_date < today);
                if (pastPending.length > 0) {
                    const btn = batchRow.querySelector('#btn-batch-complete');
                    btn.textContent = `Complete past instances (${pastPending.length} pending)`;
                    batchRow.style.display = '';
                }
            }
        } catch (err) {
            // Non-critical, just don't show the button
        }
    }

    async function handleBatchComplete() {
        if (!currentTaskId) return;

        const btn = backdropEl.querySelector('#btn-batch-complete');
        btn.disabled = true;
        btn.textContent = 'Completing...';

        try {
            const today = new Date().toISOString().split('T')[0];
            const response = await fetch('/api/v1/instances/batch-complete', {
                method: 'POST',
                headers: window.getCSRFHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    task_id: currentTaskId,
                    before_date: today,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                if (window.Toast) {
                    Toast.show(`Completed ${data.completed_count} past instance${data.completed_count !== 1 ? 's' : ''}`, { showUndo: false });
                }
                backdropEl.querySelector('#batch-complete-row').style.display = 'none';
            }
        } catch (err) {
            console.error('Failed to batch complete:', err);
            if (window.Toast) Toast.show('Failed to complete past instances', { showUndo: false });
        } finally {
            btn.disabled = false;
        }
    }

    // Track pending deletion for undo
    let pendingDeletion = null;
    let deletionTimeout = null;
    const DELETION_DELAY = 5000;

    async function handleDelete() {
        if (!currentTaskId || isNaN(currentTaskId)) {
            console.error('Cannot delete: invalid task ID', currentTaskId);
            return;
        }

        const taskId = currentTaskId;
        const taskTitle = backdropEl.querySelector('[name="title"]').value || 'Task';
        closeDialog();

        // Cancel any existing pending deletion
        if (pendingDeletion) {
            executeDeleteNow(pendingDeletion.taskId, pendingDeletion.removedElements);
        }

        // Remove task from UI immediately
        const taskElements = document.querySelectorAll(`[data-task-id="${taskId}"]`);
        const removedElements = [];
        taskElements.forEach(el => {
            const parent = el.parentElement;
            const nextSibling = el.nextSibling;
            const dayCalendar = el.closest('.day-calendar');
            removedElements.push({ el, parent, nextSibling, dayCalendar });
            el.remove();
            if (dayCalendar && window.recalculateOverlaps) {
                window.recalculateOverlaps(dayCalendar);
            }
        });

        // Store for undo
        pendingDeletion = { taskId, removedElements };

        // Show toast with undo
        const displayTitle = taskTitle.length > 30 ? taskTitle.substring(0, 30) + '...' : taskTitle;
        if (window.Toast) {
            Toast.show(`"${displayTitle}" deleted`, {
                onUndo: () => undoDialogDelete()
            });
        }

        // Schedule actual deletion after delay
        if (deletionTimeout) clearTimeout(deletionTimeout);
        deletionTimeout = setTimeout(() => executeDeleteNow(taskId, removedElements), DELETION_DELAY);
    }

    function undoDialogDelete() {
        if (!pendingDeletion) return;

        const { removedElements } = pendingDeletion;

        if (deletionTimeout) {
            clearTimeout(deletionTimeout);
            deletionTimeout = null;
        }

        removedElements.forEach(({ el, parent, nextSibling, dayCalendar }) => {
            if (parent) {
                if (nextSibling && nextSibling.parentNode === parent) {
                    parent.insertBefore(el, nextSibling);
                } else {
                    parent.appendChild(el);
                }
                if (dayCalendar && window.recalculateOverlaps) {
                    window.recalculateOverlaps(dayCalendar);
                }
            }
        });

        pendingDeletion = null;
    }

    async function executeDeleteNow(taskId, removedElements) {
        pendingDeletion = null;
        if (deletionTimeout) {
            clearTimeout(deletionTimeout);
            deletionTimeout = null;
        }

        try {
            const response = await fetch(`/api/v1/tasks/${taskId}`, {
                method: 'DELETE',
                headers: window.getCSRFHeaders(),
            });

            if (!response.ok) {
                removedElements.forEach(({ el, parent, nextSibling, dayCalendar }) => {
                    if (parent) {
                        if (nextSibling && nextSibling.parentNode === parent) {
                            parent.insertBefore(el, nextSibling);
                        } else {
                            parent.appendChild(el);
                        }
                        if (dayCalendar && window.recalculateOverlaps) {
                            window.recalculateOverlaps(dayCalendar);
                        }
                    }
                });
                if (window.Toast) {
                    Toast.show('Failed to delete task', { showUndo: false });
                }
            }
        } catch (err) {
            console.error('Failed to delete task:', err);
            removedElements.forEach(({ el, parent, nextSibling, dayCalendar }) => {
                if (parent) {
                    if (nextSibling && nextSibling.parentNode === parent) {
                        parent.insertBefore(el, nextSibling);
                    } else {
                        parent.appendChild(el);
                    }
                    if (dayCalendar && window.recalculateOverlaps) {
                        window.recalculateOverlaps(dayCalendar);
                    }
                }
            });
            if (window.Toast) {
                Toast.show('Failed to delete task', { showUndo: false });
            }
        }
    }

    /**
     * Handle Complete/Reopen button click.
     * Toggles task completion status immediately (no save required).
     * For recurring tasks, toggles today's instance.
     */
    async function handleComplete() {
        if (!currentTaskId || isNaN(currentTaskId)) {
            console.error('Cannot toggle completion: invalid task ID', currentTaskId);
            return;
        }

        const taskId = currentTaskId;
        const completeBtn = backdropEl.querySelector('#btn-complete');
        const isRecurring = completeBtn.dataset.isRecurring === 'true';
        const isCurrentlyCompleted = completeBtn.classList.contains('is-completed');

        // Disable button during request
        completeBtn.disabled = true;

        try {
            // For recurring tasks, we need to send a body with target_date
            const requestBody = {};
            if (isRecurring) {
                // Use today's date for the instance
                const today = new Date();
                requestBody.target_date = today.toISOString().split('T')[0];
            }

            const response = await fetch(`/api/v1/tasks/${taskId}/toggle-complete`, {
                method: 'POST',
                headers: window.getCSRFHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                throw new Error('Failed to toggle completion');
            }

            const data = await response.json();
            const newCompleted = data.completed;

            // Update button text and icon
            if (newCompleted) {
                completeBtn.innerHTML = '<span class="btn-complete-icon">↺</span> Reopen';
                completeBtn.classList.add('is-completed');
            } else {
                completeBtn.innerHTML = '<span class="btn-complete-icon">✓</span> Complete';
                completeBtn.classList.remove('is-completed');
            }

            // Update completed metadata (only for non-recurring tasks)
            if (!isRecurring) {
                backdropEl.querySelector('[name="task_status"]').value = newCompleted ? 'completed' : 'pending';
                const completedRow = backdropEl.querySelector('#meta-completed-row');
                if (newCompleted) {
                    completedRow.style.display = 'block';
                    backdropEl.querySelector('#meta-completed-at').textContent = 'Task completed at ' + formatDateTime(new Date().toISOString());
                } else {
                    completedRow.style.display = 'none';
                }
            }

            // Update UI elements across the page
            document.querySelectorAll(`[data-task-id="${taskId}"]`).forEach(el => {
                el.dataset.completed = newCompleted ? '1' : '0';
            });

            // Show toast
            if (window.Toast) {
                const message = isRecurring
                    ? (newCompleted ? 'Instance completed' : 'Instance reopened')
                    : (newCompleted ? 'Task completed' : 'Task reopened');
                Toast.show(message, { showUndo: false });
            }

            completeBtn.disabled = false;

        } catch (err) {
            console.error('Failed to toggle completion:', err);
            completeBtn.disabled = false;
            if (window.Toast) {
                Toast.show('Failed to update task', { showUndo: false });
            }
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();

        const form = e.target;
        const formData = new FormData(form);

        // Get recurrence rule from our state variable
        const recurrenceRule = getRecurrenceRule();
        const isRecurring = recurrenceRule !== null;

        // Get date/time from dataset (set by Air Datepicker)
        const scheduledDate = backdropEl.querySelector('[name="scheduled_date"]').dataset.value || null;
        const scheduledTime = backdropEl.querySelector('[name="scheduled_time"]').dataset.value || null;
        const dueDate = backdropEl.querySelector('[name="due_date"]').dataset.value || null;

        let data = {
            title: formData.get('title'),
            description: formData.get('description') || null,
            domain_id: formData.get('domain_id') ? parseInt(formData.get('domain_id'), 10) : null,
            scheduled_date: scheduledDate,
            scheduled_time: scheduledTime,
            due_date: dueDate,
            duration_minutes: formData.get('duration_minutes') ? parseInt(formData.get('duration_minutes'), 10) : null,
            impact: parseInt(formData.get('impact'), 10) || 4,
            clarity: formData.get('clarity') || null,
            is_recurring: isRecurring,
            recurrence_rule: recurrenceRule,
            recurrence_start: isRecurring ? (backdropEl.querySelector('#recurrence-start').dataset.value || null) : null,
            recurrence_end: isRecurring ? (backdropEl.querySelector('#recurrence-end').dataset.value || null) : null,
        };

        const method = currentTaskId ? 'PUT' : 'POST';
        const url = currentTaskId ? `/api/v1/tasks/${currentTaskId}` : '/api/v1/tasks';

        try {
            const submitBtn = backdropEl.querySelector('.btn-submit');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            // E2E Encryption: Encrypt task data if encryption is enabled
            if (Crypto.canCrypto()) {
                data.title = await Crypto.encryptField(data.title);
                data.description = await Crypto.encryptField(data.description);
            }

            const response = await fetch(url, {
                method,
                headers: window.getCSRFHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(data),
            });

            if (response.ok) {
                closeDialog();
                window.location.reload();
            } else {
                const error = await response.json();
                alert(error.detail || 'Failed to save task');
                submitBtn.disabled = false;
                submitBtn.textContent = currentTaskId ? 'Save' : 'Add task';
            }
        } catch (err) {
            console.error('Failed to save task:', err);
            alert('Failed to save task. Please try again.');
            const submitBtn = backdropEl.querySelector('.btn-submit');
            submitBtn.disabled = false;
            submitBtn.textContent = currentTaskId ? 'Save' : 'Add task';
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for external use
    window.TaskDialog = {
        open: openDialog,
        close: closeDialog,
        refresh: loadDomains,
    };
})();
