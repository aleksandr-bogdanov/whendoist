/**
 * WhenWizard - First-Run Onboarding
 *
 * Handles the 8-step onboarding wizard with:
 * - State management with localStorage persistence
 * - Swipe navigation for touch devices
 * - Keyboard handling for virtual keyboards
 * - Haptic feedback
 * - Reduced motion support
 */

// =============================================================================
// Keyboard Handler
// =============================================================================

class KeyboardHandler {
    constructor() {
        this.originalHeight = window.innerHeight;
        this.init();
    }

    init() {
        if ('visualViewport' in window) {
            window.visualViewport.addEventListener('resize', this.onViewportResize.bind(this));
        } else {
            window.addEventListener('resize', this.onResize.bind(this));
        }
    }

    onViewportResize() {
        const viewport = window.visualViewport;
        const keyboardHeight = this.originalHeight - viewport.height;
        const isKeyboardOpen = keyboardHeight > 100;

        document.body.classList.toggle('keyboard-open', isKeyboardOpen);

        if (isKeyboardOpen) {
            const focused = document.activeElement;
            if (focused && focused.matches('input, textarea')) {
                setTimeout(() => {
                    focused.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }
    }

    onResize() {
        const heightDiff = this.originalHeight - window.innerHeight;
        const isKeyboardOpen = heightDiff > 100;
        document.body.classList.toggle('keyboard-open', isKeyboardOpen);
    }
}

// =============================================================================
// Swipe Handler
// =============================================================================

class WizardSwipeHandler {
    constructor(panel, onBack, onForward) {
        this.panel = panel;
        this.onBack = onBack;
        this.onForward = onForward;

        this.startX = 0;
        this.startY = 0;
        this.currentX = 0;
        this.isDragging = false;
        this.startTime = 0;

        // Higher thresholds to avoid accidental swipes
        this.threshold = 120;
        this.velocityThreshold = 0.7;

        this.init();
    }

    init() {
        if (!('ontouchstart' in window)) return;

        this.panel.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: true });
        this.panel.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        this.panel.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: true });
    }

    onTouchStart(e) {
        // Exclude many interactive elements from swipe
        if (e.target.closest('button, input, select, a, [role="button"], .wizard-checkbox, .wizard-domain-chip, .wizard-calendar-row, .wizard-mode-card, .wizard-option, .wizard-emoji-popover, .wizard-emoji-btn')) return;

        this.startX = e.touches[0].clientX;
        this.startY = e.touches[0].clientY;
        this.startTime = Date.now();
        this.isDragging = true;
    }

    onTouchMove(e) {
        if (!this.isDragging) return;

        this.currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = this.currentX - this.startX;
        const deltaY = currentY - this.startY;

        if (Math.abs(deltaY) > Math.abs(deltaX)) {
            this.isDragging = false;
            return;
        }

        if (Math.abs(deltaX) > 10) {
            e.preventDefault();
        }

        const content = this.panel.querySelector('.wizard-step-content');
        if (content) {
            const translateX = Math.max(-100, Math.min(100, deltaX * 0.3));
            content.style.transform = `translateX(${translateX}px)`;
            content.style.opacity = 1 - Math.abs(translateX) / 200;
        }
    }

    onTouchEnd() {
        if (!this.isDragging) return;
        this.isDragging = false;

        const deltaX = this.currentX - this.startX;
        const deltaTime = Date.now() - this.startTime;
        const velocity = Math.abs(deltaX) / deltaTime;

        const content = this.panel.querySelector('.wizard-step-content');
        if (content) {
            content.style.transform = '';
            content.style.opacity = '';
        }

        const shouldNavigate = Math.abs(deltaX) > this.threshold || velocity > this.velocityThreshold;

        if (shouldNavigate) {
            if (deltaX > 0) {
                this.onBack();
            } else {
                this.onForward();
            }
        }
    }
}

// =============================================================================
// Main Wizard Class
// =============================================================================

class WhenWizard {
    constructor() {
        this.state = this.loadState() || this.getInitialState();

        // Always sync connection states from server (may have changed via OAuth)
        if (window.WHENDOIST) {
            this.state.data.calendarConnected = window.WHENDOIST.calendarConnected || false;
            this.state.data.todoistConnected = window.WHENDOIST.todoistConnected || false;
        }

        this.panel = document.querySelector('.wizard-panel');
        this.keyboardHandler = new KeyboardHandler();
        this.swipeHandler = null;

        this.init();
    }

    getInitialState() {
        return {
            currentStep: 1,
            completedSteps: [],
            data: {
                calendarConnected: window.WHENDOIST?.calendarConnected || false,
                selectedCalendars: [],
                todoistConnected: window.WHENDOIST?.todoistConnected || false,
                importConfig: null,
                importResult: null,
                domains: [],
                encryptionEnabled: false,
                passkeyRegistered: false,
                acknowledgmentChecked: false
            }
        };
    }

    init() {
        if ('ontouchstart' in window) {
            this.swipeHandler = new WizardSwipeHandler(
                this.panel,
                () => this.goBack(),
                () => this.goForward()
            );
        }

        this.renderStep(this.state.currentStep);
        this.updateProgress();
        this.bindGlobalEvents();

        // Pre-fetch calendars if already connected
        this.prefetchCalendars();

        this.saveState();
    }

    bindGlobalEvents() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
                const primaryBtn = this.panel.querySelector('.wizard-btn-primary:not(:disabled)');
                if (primaryBtn) primaryBtn.click();
            }
        });
    }

    // =========================================================================
    // Navigation
    // =========================================================================

    goBack() {
        if (this.state.currentStep > 1) {
            this.triggerHaptic('light');
            this.transitionTo(this.state.currentStep - 1, 'back');
        }
    }

    goForward() {
        if (this.canProceed()) {
            this.triggerHaptic('light');
            this.markStepCompleted(this.state.currentStep);

            const nextStep = this.getNextStep();
            if (nextStep > 8) {
                this.complete();
            } else {
                this.transitionTo(nextStep, 'forward');
            }
        }
    }

    skipStep() {
        this.triggerHaptic('light');
        const nextStep = this.getNextStep();
        this.transitionTo(nextStep, 'forward');
    }

    getNextStep() {
        let next = this.state.currentStep + 1;

        // Skip Step 4 if calendar not connected
        if (next === 4 && !this.state.data.calendarConnected) {
            next = 5;
        }

        return next;
    }

    canProceed() {
        switch (this.state.currentStep) {
            case 6: // Domains - require at least one
                return this.state.data.domains.length > 0;
            case 7: // Security - always can proceed (encryption is optional)
                return true;
            default:
                return true;
        }
    }

    transitionTo(step, direction) {
        const content = this.panel.querySelector('.wizard-step-content');

        content.classList.add(direction === 'forward' ? 'exit-left' : 'exit-right');

        setTimeout(() => {
            this.state.currentStep = step;
            this.renderStep(step);
            this.updateProgress();
            this.saveState();

            const newContent = this.panel.querySelector('.wizard-step-content');
            newContent.classList.add(direction === 'forward' ? 'enter-right' : 'enter-left');

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    newContent.classList.remove('enter-right', 'enter-left');
                });
            });
        }, 250);
    }

    markStepCompleted(step) {
        if (!this.state.completedSteps.includes(step)) {
            this.state.completedSteps.push(step);

            const dot = this.panel.querySelector(`.wizard-progress-dot[data-step="${step}"]`);
            if (dot) {
                dot.classList.add('completing');
                setTimeout(() => dot.classList.remove('completing'), 300);
            }
        }
    }

    // =========================================================================
    // Completion
    // =========================================================================

    async complete() {
        this.triggerHaptic('success');

        try {
            // Save calendar selections if any
            if (this.state.data.selectedCalendars.length > 0) {
                await this.saveCalendarSelections();
            }

            // Mark wizard as complete
            await fetch('/api/wizard/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e) {
            console.error('Failed to complete wizard:', e);
        }

        this.clearState();

        this.panel.classList.add('completing');

        setTimeout(() => {
            window.location.reload();
        }, 400);
    }

    async saveCalendarSelections() {
        // Save selected calendars to the database
        try {
            await fetch('/api/calendars/selections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    calendar_ids: this.state.data.selectedCalendars
                })
            });
        } catch (e) {
            console.error('Failed to save calendar selections:', e);
        }
    }

    // =========================================================================
    // State Management
    // =========================================================================

    loadState() {
        try {
            const saved = localStorage.getItem('whendoist_wizard_state');
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    }

    saveState() {
        try {
            localStorage.setItem('whendoist_wizard_state', JSON.stringify(this.state));
        } catch {
            // localStorage might be full or disabled
        }
    }

    clearState() {
        localStorage.removeItem('whendoist_wizard_state');
    }

    // =========================================================================
    // Haptic Feedback
    // =========================================================================

    triggerHaptic(type) {
        if ('vibrate' in navigator) {
            const patterns = {
                light: 10,
                medium: 20,
                success: [10, 50, 20],
                error: [20, 100, 20, 100, 20]
            };
            navigator.vibrate(patterns[type] || 10);
        }
    }

    // =========================================================================
    // Progress Indicator
    // =========================================================================

    updateProgress() {
        const dots = this.panel.querySelectorAll('.wizard-progress-dot');
        dots.forEach((dot) => {
            const step = parseInt(dot.dataset.step);
            dot.classList.remove('current', 'completed');

            if (step === this.state.currentStep) {
                dot.classList.add('current');
            } else if (this.state.completedSteps.includes(step)) {
                dot.classList.add('completed');
            }
        });
    }

    // =========================================================================
    // Rendering
    // =========================================================================

    renderStep(step) {
        const content = this.panel.querySelector('.wizard-content');

        switch (step) {
            case 1:
                content.innerHTML = this.renderStep1();
                break;
            case 2:
                content.innerHTML = this.renderStep2();
                this.bindStep2Events();
                break;
            case 3:
                content.innerHTML = this.renderStep3();
                break;
            case 4:
                content.innerHTML = this.renderStep4();
                this.bindStep4Events();
                break;
            case 5:
                content.innerHTML = this.renderStep5();
                break;
            case 6:
                content.innerHTML = this.renderStep6();
                break;
            case 7:
                content.innerHTML = this.renderStep7();
                this.bindStep7Events();
                break;
            case 8:
                content.innerHTML = this.renderStep8();
                break;
        }

        this.updateNavigation();
    }

    updateNavigation() {
        const nav = this.panel.querySelector('.wizard-nav');
        const step = this.state.currentStep;

        let navHTML = '';

        switch (step) {
            case 1:
                navHTML = `
                    <div class="wizard-nav-spacer"></div>
                    <button class="wizard-btn-primary" onclick="wizard.goForward()">Get Started</button>
                `;
                break;
            case 2:
                navHTML = `
                    <button class="wizard-btn-secondary" onclick="wizard.goBack()">Back</button>
                    <button class="wizard-btn-primary" onclick="wizard.goForward()">Got it, continue</button>
                `;
                break;
            case 3:
                if (this.state.data.calendarConnected) {
                    navHTML = `
                        <button class="wizard-btn-secondary" onclick="wizard.goBack()">Back</button>
                        <button class="wizard-btn-primary" onclick="wizard.goForward()">Continue</button>
                    `;
                } else {
                    navHTML = `
                        <button class="wizard-btn-secondary" onclick="wizard.goBack()">Back</button>
                        <button class="wizard-btn-ghost" onclick="wizard.skipStep()">Skip for now</button>
                    `;
                }
                break;
            case 4:
                navHTML = `
                    <button class="wizard-btn-secondary" onclick="wizard.goBack()">Back</button>
                    <button class="wizard-btn-primary" onclick="wizard.goForward()">Continue</button>
                `;
                break;
            case 5:
                if (this.state.data.importResult) {
                    navHTML = `
                        <div class="wizard-nav-spacer"></div>
                        <button class="wizard-btn-primary" onclick="wizard.goForward()">Continue</button>
                    `;
                } else {
                    navHTML = `
                        <button class="wizard-btn-secondary" onclick="wizard.goBack()">Back</button>
                        <button class="wizard-btn-ghost" onclick="wizard.skipStep()">Start fresh</button>
                    `;
                }
                break;
            case 6:
                const canContinue = this.state.data.domains.length > 0;
                navHTML = `
                    <button class="wizard-btn-secondary" onclick="wizard.goBack()">Back</button>
                    <button class="wizard-btn-primary" onclick="wizard.goForward()" ${canContinue ? '' : 'disabled'}>Continue</button>
                `;
                break;
            case 7:
                navHTML = `
                    <button class="wizard-btn-secondary" onclick="wizard.goBack()">Back</button>
                    <button class="wizard-btn-primary" onclick="wizard.goForward()">Continue</button>
                `;
                break;
            case 8:
                navHTML = `
                    <div class="wizard-nav-spacer"></div>
                    <button class="wizard-btn-primary" onclick="wizard.complete()">Open Dashboard</button>
                `;
                break;
        }

        nav.innerHTML = navHTML;
    }

    // =========================================================================
    // Step Renderers
    // =========================================================================

    renderStep1() {
        const userName = window.WHENDOIST?.userName || 'there';
        return `
            <div class="wizard-step-content">
                <img src="/static/img/logo.png" alt="Whendoist" class="wizard-welcome-logo" style="margin-top: 40px;">

                <p class="wizard-subtitle" style="margin-top: 8px;">WHEN do I do my tasks?</p>

                <div class="wizard-card" style="text-align: center;">
                    <p style="margin: 0; color: var(--text-muted); line-height: 1.6;">
                        Your calendar shows when you're busy.<br>
                        Your task list shows what to do.<br>
                        <strong style="color: var(--text);">Whendoist shows when to actually do it.</strong>
                    </p>
                </div>

                <p class="wizard-welcome-greeting">Welcome, ${this.escapeHtml(userName)}</p>

                ${this.renderProgress()}
            </div>
        `;
    }

    renderStep2() {
        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">WORK WITH YOUR ENERGY</h1>
                <p class="wizard-subtitle">FILTER TASKS BY HOW MUCH FOCUS THEY NEED</p>

                <div class="wizard-card">
                    <div class="wizard-mode-cards">
                        <div class="wizard-mode-card" data-mode="zombie">
                            <div class="wizard-mode-emoji">&#129503;</div>
                            <div class="wizard-mode-name">ZOMBIE</div>
                            <div class="wizard-mode-description">Clear next action, can do when tired</div>
                        </div>
                        <div class="wizard-mode-card selected" data-mode="normal">
                            <div class="wizard-mode-emoji">&#9749;</div>
                            <div class="wizard-mode-name">NORMAL</div>
                            <div class="wizard-mode-description">Know what to do, needs some focus</div>
                        </div>
                        <div class="wizard-mode-card" data-mode="focus">
                            <div class="wizard-mode-emoji">&#129504;</div>
                            <div class="wizard-mode-name">FOCUS</div>
                            <div class="wizard-mode-description">Needs deep thinking or research</div>
                        </div>
                    </div>

                    <div class="wizard-preview-divider"></div>

                    <div class="wizard-section-title">PREVIEW</div>
                    <div class="wizard-preview-tasks">
                        <div class="wizard-preview-task clarity-executable" data-clarity="executable">
                            <span class="wizard-preview-task-title">Review pull requests</span>
                            <span class="wizard-preview-task-duration">30m</span>
                        </div>
                        <div class="wizard-preview-task clarity-executable" data-clarity="executable">
                            <span class="wizard-preview-task-title">Reply to Sarah's email</span>
                            <span class="wizard-preview-task-duration">15m</span>
                        </div>
                        <div class="wizard-preview-task clarity-defined" data-clarity="defined">
                            <span class="wizard-preview-task-title">Update project documentation</span>
                            <span class="wizard-preview-task-duration">1h</span>
                        </div>
                        <div class="wizard-preview-task clarity-exploratory" data-clarity="exploratory">
                            <span class="wizard-preview-task-title">Research competitor features</span>
                            <span class="wizard-preview-task-duration">2h</span>
                        </div>
                    </div>
                </div>

                ${this.renderProgress()}
                ${this.renderSwipeHint()}
            </div>
        `;
    }

    bindStep2Events() {
        const cards = this.panel.querySelectorAll('.wizard-mode-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                cards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.updateTaskPreview(card.dataset.mode);
            });
        });
    }

    updateTaskPreview(mode) {
        const tasks = this.panel.querySelectorAll('.wizard-preview-task');
        const visibility = {
            zombie: ['executable'],
            normal: ['executable', 'defined'],
            focus: ['executable', 'defined', 'exploratory']
        };

        tasks.forEach(task => {
            const clarity = task.dataset.clarity;
            const shouldShow = visibility[mode].includes(clarity);
            task.classList.toggle('hidden', !shouldShow);
        });
    }

    renderStep3() {
        const isConnected = this.state.data.calendarConnected;
        const userEmail = window.WHENDOIST?.userEmail || '';

        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">CONNECT YOUR CALENDAR</h1>
                <p class="wizard-subtitle">PLAN TASKS AROUND YOUR COMMITMENTS</p>

                <div class="wizard-connection-card">
                    <div class="wizard-connection-logo" style="font-size:2rem;">&#128197;</div>

                    <div class="wizard-connection-name">Google Calendar</div>

                    <div class="wizard-connection-status">
                        <span class="wizard-connection-dot ${isConnected ? 'connected' : ''}"></span>
                        <span>${isConnected ? 'Connected' : 'Not connected'}</span>
                    </div>

                    ${isConnected ? `
                        <div class="wizard-connection-email">${this.escapeHtml(userEmail)}</div>
                    ` : `
                        <button class="wizard-btn-primary" onclick="wizard.connectCalendar()">
                            Connect Google Calendar
                        </button>
                    `}
                </div>

                <p class="wizard-connection-privacy">
                    We only read your calendar to display events.
                    We never modify, delete, or share your data.
                </p>

                ${this.renderProgress()}
                ${this.renderSwipeHint()}
            </div>
        `;
    }

    connectCalendar() {
        // Store current wizard state before redirecting
        this.saveState();
        // Redirect to Google OAuth with calendar scope
        window.location.href = '/auth/google?wizard=true';
    }

    // Pre-fetch calendars when connection status changes (called on init if already connected)
    async prefetchCalendars() {
        if (this.state.data.calendarConnected && !this.state.data.cachedCalendars) {
            try {
                const response = await fetch('/api/calendars');
                const calendars = await response.json();
                this.state.data.cachedCalendars = calendars;
                this.saveState();
            } catch (e) {
                console.error('Failed to prefetch calendars:', e);
            }
        }
    }

    renderStep4() {
        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">WHICH CALENDARS MATTER?</h1>
                <p class="wizard-subtitle">WE'LL WORK AROUND YOUR EXISTING COMMITMENTS</p>

                <div class="wizard-card">
                    <div class="wizard-calendar-list" id="calendarList" style="min-height: 200px;">
                        <div style="text-align: center; padding: 20px; color: var(--text-muted);">
                            Loading calendars...
                        </div>
                    </div>

                    <div class="wizard-helper-links">
                        <button class="wizard-helper-link" onclick="wizard.selectAllCalendars()">Select all</button>
                        <span style="color: var(--border);">&#183;</span>
                        <button class="wizard-helper-link" onclick="wizard.selectNoCalendars()">Select none</button>
                    </div>
                </div>

                ${this.renderProgress()}
                ${this.renderSwipeHint()}
            </div>
        `;
    }

    async bindStep4Events() {
        await this.loadCalendars();
    }

    async loadCalendars() {
        try {
            // Use cached calendars if available
            let calendars = this.state.data.cachedCalendars;
            if (!calendars) {
                const response = await fetch('/api/calendars');
                calendars = await response.json();
                this.state.data.cachedCalendars = calendars;
                this.saveState();
            }

            const list = this.panel.querySelector('#calendarList');

            if (calendars.length === 0) {
                list.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: var(--text-muted);">
                        No calendars found. You can add calendars in Settings later.
                    </div>
                `;
                return;
            }

            list.innerHTML = calendars.map(cal => {
                const isSelected = this.state.data.selectedCalendars.includes(cal.id) ||
                                   (this.state.data.selectedCalendars.length === 0 && cal.primary);
                return `
                    <div class="wizard-calendar-row ${isSelected ? 'selected' : ''}"
                         data-calendar-id="${this.escapeHtml(cal.id)}"
                         onclick="wizard.toggleCalendar('${this.escapeHtml(cal.id)}')">
                        <span class="wizard-calendar-color" style="background: ${cal.background_color || '#4285f4'}"></span>
                        <span class="wizard-calendar-name">${this.escapeHtml(cal.summary)}</span>
                        <div class="wizard-checkbox ${isSelected ? 'checked' : ''}"></div>
                    </div>
                `;
            }).join('');

            // Initialize selection state
            if (this.state.data.selectedCalendars.length === 0) {
                const primary = calendars.find(c => c.primary);
                if (primary) {
                    this.state.data.selectedCalendars = [primary.id];
                    this.saveState();
                }
            }
        } catch (e) {
            console.error('Failed to load calendars:', e);
        }
    }

    toggleCalendar(id) {
        const index = this.state.data.selectedCalendars.indexOf(id);
        if (index > -1) {
            this.state.data.selectedCalendars.splice(index, 1);
        } else {
            this.state.data.selectedCalendars.push(id);
        }

        const row = this.panel.querySelector(`[data-calendar-id="${id}"]`);
        const checkbox = row.querySelector('.wizard-checkbox');
        row.classList.toggle('selected');
        checkbox.classList.toggle('checked');

        this.saveState();
    }

    selectAllCalendars() {
        const rows = this.panel.querySelectorAll('.wizard-calendar-row');
        this.state.data.selectedCalendars = [];

        rows.forEach(row => {
            const id = row.dataset.calendarId;
            this.state.data.selectedCalendars.push(id);
            row.classList.add('selected');
            row.querySelector('.wizard-checkbox').classList.add('checked');
        });

        this.saveState();
    }

    selectNoCalendars() {
        const rows = this.panel.querySelectorAll('.wizard-calendar-row');
        this.state.data.selectedCalendars = [];

        rows.forEach(row => {
            row.classList.remove('selected');
            row.querySelector('.wizard-checkbox').classList.remove('checked');
        });

        this.saveState();
    }

    renderStep5() {
        if (this.state.data.importResult) {
            return this.renderStep5Complete();
        }
        if (this.state.data.todoistConnected) {
            return this.renderStep5Connected();
        }
        return this.renderStep5Source();
    }

    renderStep5Source() {
        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">ALREADY HAVE TASKS?</h1>
                <p class="wizard-subtitle">IMPORT TO START FASTER</p>

                <div class="wizard-import-source">
                    <div class="wizard-import-logo" style="font-size: 2rem;">&#128203;</div>
                    <div class="wizard-import-title">Import from Todoist</div>
                    <div class="wizard-import-description">
                        Bring your projects, tasks, and labels
                    </div>
                    <button class="wizard-btn-primary" onclick="wizard.connectTodoist()">
                        Connect Todoist
                    </button>
                </div>

                <div class="wizard-import-divider">or</div>

                <div style="text-align: center;">
                    <button class="wizard-btn-ghost" onclick="wizard.skipStep()">
                        Start fresh instead
                    </button>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
                        I'll create my own tasks
                    </div>
                </div>

                ${this.renderProgress()}
                ${this.renderSwipeHint()}
            </div>
        `;
    }

    renderStep5Connected() {
        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">TODOIST CONNECTED</h1>
                <p class="wizard-subtitle">READY TO IMPORT YOUR TASKS</p>

                <div class="wizard-import-source">
                    <div class="wizard-import-logo" style="font-size: 2rem;">&#9989;</div>
                    <div class="wizard-import-title">Todoist Connected</div>
                    <div class="wizard-import-description">
                        Click below to import your projects and tasks
                    </div>
                    <button class="wizard-btn-primary" onclick="wizard.startTodoistImport()">
                        Import Tasks
                    </button>
                </div>

                <div class="wizard-import-divider">or</div>

                <div style="text-align: center;">
                    <button class="wizard-btn-ghost" onclick="wizard.skipStep()">
                        Skip - I'll import later
                    </button>
                </div>

                ${this.renderProgress()}
                ${this.renderSwipeHint()}
            </div>
        `;
    }

    async startTodoistImport() {
        const btn = this.panel.querySelector('.wizard-import-source button');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Importing...';
        }

        try {
            const response = await fetch('/api/import/todoist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ include_completed: false })
            });

            if (!response.ok) {
                throw new Error('Import failed');
            }

            const result = await response.json();
            this.state.data.importResult = {
                tasksImported: result.tasks_created || 0,
                projectsImported: result.domains_created || 0
            };
            this.saveState();
            this.renderStep(5);
            this.updateNavigation();
        } catch (e) {
            console.error('Todoist import failed:', e);
            Toast.show('Import failed: ' + e.message, { type: 'error' });
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Import Tasks';
            }
        }
    }

    renderStep5Complete() {
        const result = this.state.data.importResult;
        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">IMPORT COMPLETE</h1>

                <div class="wizard-import-complete">
                    <div class="wizard-import-success-icon">&#10003;</div>

                    <div class="wizard-stat-cards">
                        <div class="wizard-stat-card">
                            <div class="wizard-stat-value">${result.tasksImported || 0}</div>
                            <div class="wizard-stat-label">tasks</div>
                        </div>
                        <div class="wizard-stat-card">
                            <div class="wizard-stat-value">${result.projectsImported || 0}</div>
                            <div class="wizard-stat-label">projects</div>
                        </div>
                    </div>

                    <p class="wizard-import-complete-note">
                        Your Todoist projects are now Domains.<br>
                        Rename or reorganize them anytime.
                    </p>
                </div>

                ${this.renderProgress()}
            </div>
        `;
    }

    connectTodoist() {
        // Store current wizard state before redirecting
        this.saveState();
        // Redirect to Todoist OAuth
        window.location.href = '/auth/todoist?wizard=true';
    }

    renderStep6() {
        // Store suggestions with actual emoji characters for DB storage
        const suggestions = [
            { emoji: '&#128188;', emojiChar: '💼', name: 'Work' },
            { emoji: '&#127968;', emojiChar: '🏠', name: 'Personal' },
            { emoji: '&#127939;', emojiChar: '🏃', name: 'Health' },
            { emoji: '&#128218;', emojiChar: '📚', name: 'Learning' },
            { emoji: '&#128176;', emojiChar: '💰', name: 'Finance' },
            { emoji: '&#127912;', emojiChar: '🎨', name: 'Creative' }
        ];
        this._domainSuggestions = suggestions;

        // domains is now array of objects: [{name, icon}, ...]
        const selectedNames = this.state.data.domains.map(d => typeof d === 'string' ? d : d.name);

        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">ORGANIZE YOUR LIFE</h1>
                <p class="wizard-subtitle">DOMAINS = BIG AREAS OF YOUR LIFE</p>

                <div class="wizard-card">
                    <div class="wizard-section-title">START WITH THESE</div>

                    <div class="wizard-domain-chips">
                        ${suggestions.map(d => {
                            const isSelected = selectedNames.includes(d.name);
                            return `
                                <div class="wizard-domain-chip ${isSelected ? 'selected' : ''}"
                                     data-domain="${d.name}"
                                     data-icon="${d.emojiChar}"
                                     onclick="wizard.toggleDomain('${d.name}', '${d.emojiChar}')">
                                    <span class="wizard-domain-emoji">${d.emoji}</span>
                                    <span class="wizard-domain-name">${d.name}</span>
                                    <span class="wizard-domain-check">${isSelected ? '&#10003;' : ''}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div class="wizard-add-domain-section">
                    <div class="wizard-add-domain-form" id="addDomainForm" style="display: none;">
                        <div class="wizard-add-domain-row">
                            <div class="wizard-emoji-picker-wrap">
                                <button type="button" class="wizard-emoji-btn" id="customDomainIcon" onclick="wizard.toggleEmojiPicker()">📁</button>
                                <div class="wizard-emoji-popover" id="emojiPopover"></div>
                            </div>
                            <input type="text"
                                   class="wizard-input wizard-domain-input"
                                   id="customDomainName"
                                   placeholder="Domain name (e.g., Side Project)"
                                   maxlength="50"
                                   onkeydown="if(event.key === 'Enter') wizard.addCustomDomain()">
                        </div>
                        <div class="wizard-add-domain-actions">
                            <button class="wizard-btn-ghost wizard-btn-sm" onclick="wizard.hideAddDomain()">Cancel</button>
                            <button class="wizard-btn-primary wizard-btn-sm" onclick="wizard.addCustomDomain()">Add</button>
                        </div>
                    </div>
                    <div class="wizard-add-domain-trigger" id="addDomainTrigger" onclick="wizard.showAddDomain()">
                        <span>+</span>
                        <span>Add custom domain...</span>
                    </div>
                </div>

                ${selectedNames.length > 0 ? `
                    <div class="wizard-domain-summary">
                        Selected: ${selectedNames.join(', ')}
                    </div>
                ` : ''}

                ${this.renderProgress()}
                ${this.renderSwipeHint()}
            </div>
        `;
    }

    async toggleDomain(name, icon = '📁') {
        // Normalize domains to objects
        this.state.data.domains = this.state.data.domains.map(d =>
            typeof d === 'string' ? { name: d, icon: '📁' } : d
        );

        const index = this.state.data.domains.findIndex(d => d.name === name);
        if (index > -1) {
            this.state.data.domains.splice(index, 1);
        } else {
            this.state.data.domains.push({ name, icon });
            // Create domain in database immediately with icon
            await this.createDomain(name, icon);
        }

        // Preserve custom domain form state before re-rendering
        const formVisible = document.getElementById('addDomainForm')?.style.display === 'block';
        const customName = document.getElementById('customDomainName')?.value || '';
        const customIcon = document.getElementById('customDomainIcon')?.textContent || '📁';

        this.renderStep(6);
        this.updateNavigation();
        this.saveState();

        // Restore custom domain form state after re-rendering
        if (formVisible) {
            document.getElementById('addDomainForm').style.display = 'block';
            document.getElementById('addDomainTrigger').style.display = 'none';
            document.getElementById('customDomainName').value = customName;
            document.getElementById('customDomainIcon').textContent = customIcon;
        }
    }

    async createDomain(name, icon = '📁') {
        try {
            await fetch('/api/domains', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, icon })
            });
        } catch (e) {
            console.error('Failed to create domain:', e);
        }
    }

    // Emoji picker list
    static DOMAIN_EMOJIS = [
        '📁', '💼', '🏠', '👤', '👥', '💪', '🧘',
        '📚', '🎓', '💻', '🎨', '🎵', '🎮', '📷',
        '✈️', '🚗', '🏃', '⚽', '🎯', '💰', '📈',
        '❤️', '🌟', '🔥', '✨', '🎉', '🎁', '🏆',
        '🍎', '🥗', '☕', '🍳', '🛒', '🏥', '💊',
        '🐕', '🌱', '🌍', '☀️', '🌙', '⚡', '🔧'
    ];

    showAddDomain() {
        document.getElementById('addDomainForm').style.display = 'block';
        document.getElementById('addDomainTrigger').style.display = 'none';
        document.getElementById('customDomainName').focus();
        // Reset icon to default
        document.getElementById('customDomainIcon').textContent = '📁';
    }

    hideAddDomain() {
        document.getElementById('addDomainForm').style.display = 'none';
        document.getElementById('addDomainTrigger').style.display = 'flex';
        document.getElementById('customDomainName').value = '';
        this.hideEmojiPicker();
    }

    toggleEmojiPicker() {
        const popover = document.getElementById('emojiPopover');
        if (popover.classList.contains('open')) {
            this.hideEmojiPicker();
        } else {
            this.showEmojiPicker();
        }
    }

    showEmojiPicker() {
        const popover = document.getElementById('emojiPopover');
        const btn = document.getElementById('customDomainIcon');

        popover.innerHTML = WhenWizard.DOMAIN_EMOJIS.map(emoji =>
            `<button type="button" class="wizard-emoji-option" onclick="wizard.selectEmoji('${emoji}')">${emoji}</button>`
        ).join('');

        // Position popover above button using fixed positioning
        const rect = btn.getBoundingClientRect();
        popover.style.position = 'fixed';
        popover.style.left = `${rect.left}px`;
        popover.style.bottom = `${window.innerHeight - rect.top + 6}px`;
        popover.style.top = 'auto';

        popover.classList.add('open');
    }

    hideEmojiPicker() {
        const popover = document.getElementById('emojiPopover');
        if (popover) {
            popover.classList.remove('open');
        }
    }

    selectEmoji(emoji) {
        document.getElementById('customDomainIcon').textContent = emoji;
        this.hideEmojiPicker();
    }

    addCustomDomain() {
        const input = document.getElementById('customDomainName');
        const iconBtn = document.getElementById('customDomainIcon');
        const name = input.value.trim();
        const icon = iconBtn.textContent || '📁';

        if (!name) {
            return;
        }

        // Normalize existing domains to get names
        const existingNames = this.state.data.domains.map(d =>
            typeof d === 'string' ? d : d.name
        );

        if (existingNames.includes(name)) {
            Toast.show('Domain already exists', { type: 'error' });
            return;
        }

        // Add with selected icon
        this.toggleDomain(name, icon);
        this.hideAddDomain();
    }

    renderStep7() {
        const isEnabled = this.state.data.encryptionEnabled;

        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">OPTIONAL: ENCRYPTION</h1>
                <p class="wizard-subtitle">FOR PRIVACY-CONSCIOUS USERS</p>

                ${isEnabled ? `
                    <div class="wizard-encryption-enabled">
                        <div class="wizard-encryption-enabled-icon">&#128274;</div>
                        <div class="wizard-encryption-enabled-title">Encryption Enabled</div>
                        <div class="wizard-encryption-enabled-desc">
                            Your task data is now end-to-end encrypted.
                            Only you can read your tasks.
                        </div>

                        ${!this.state.data.passkeyRegistered ? `
                            <div class="wizard-passkey-card" style="margin-top: 16px;">
                                <div class="wizard-passkey-icon">&#128273;</div>
                                <div class="wizard-passkey-title">Add a backup passkey</div>
                                <div class="wizard-passkey-description">
                                    Unlock with your password manager instead of typing your passphrase.
                                </div>
                                <button class="wizard-btn-secondary" onclick="wizard.savePasskey()">
                                    Save Passkey
                                </button>
                            </div>
                        ` : `
                            <div class="wizard-passkey-status saved" style="margin-top: 12px;">
                                &#9679; Passkey saved
                            </div>
                        `}
                    </div>
                ` : `
                    <div class="wizard-card">
                        <p style="margin: 0 0 16px 0; color: var(--text-muted); font-size: 0.875rem; line-height: 1.5;">
                            End-to-end encryption means we can never read your tasks.
                            <strong>Most users don't need this.</strong> Skip if you're unsure.
                        </p>

                        <div class="wizard-security-toggle ${this.state.data.showSecuritySetup ? 'expanded' : ''}" onclick="wizard.toggleSecurity()">
                            <div class="wizard-security-toggle-label">
                                <span class="wizard-security-toggle-icon">&#128274;</span>
                                <span>Set up encryption</span>
                            </div>
                            <span class="wizard-security-toggle-chevron">&#9660;</span>
                        </div>
                    </div>

                    <div class="wizard-security-content ${this.state.data.showSecuritySetup ? 'expanded' : ''}" id="securityContent">
                        <div class="wizard-security-warning">
                            <div class="wizard-security-warning-title">
                                <span>&#9888;</span>
                                <span>IMPORTANT</span>
                            </div>
                            <ul>
                                <li>Your passphrase encrypts all task data</li>
                                <li>We cannot recover data if you forget it</li>
                                <li>Save a passkey as backup after enabling</li>
                            </ul>
                        </div>

                        <div class="wizard-section-title">CREATE PASSPHRASE</div>

                        <input type="password"
                               class="wizard-input"
                               id="passphrase"
                               placeholder="Passphrase (8+ characters)"
                               oninput="wizard.updatePassphraseStrength()">

                        <input type="password"
                               class="wizard-input"
                               id="passphraseConfirm"
                               placeholder="Confirm passphrase"
                               style="margin-top: 8px;">

                        <div class="wizard-strength-container" id="strengthContainer" style="display: none;">
                            <span class="wizard-strength-label">Strength:</span>
                            <div class="wizard-strength-bar">
                                <div class="wizard-strength-fill" id="strengthFill"></div>
                            </div>
                            <span class="wizard-strength-text" id="strengthText"></span>
                        </div>

                        <div class="wizard-acknowledgment ${this.state.data.acknowledgmentChecked ? 'checked' : ''}"
                             onclick="wizard.toggleAcknowledgment()">
                            <div class="wizard-acknowledgment-check"></div>
                            <div class="wizard-acknowledgment-text">
                                I understand that if I lose my passphrase, my data cannot be recovered.
                            </div>
                        </div>

                        <button class="wizard-btn-primary wizard-security-enable-btn"
                                id="enableEncryptionBtn"
                                onclick="wizard.enableEncryption()"
                                ${this.state.data.acknowledgmentChecked ? '' : 'disabled'}
                                style="width: 100%;">
                            Enable Encryption
                        </button>
                    </div>
                `}

                ${this.renderProgress()}
                ${this.renderSwipeHint()}
            </div>
        `;
    }

    bindStep7Events() {
        // Events bound inline
    }

    toggleSecurity() {
        this.state.data.showSecuritySetup = !this.state.data.showSecuritySetup;
        this.saveState();

        const toggle = this.panel.querySelector('.wizard-security-toggle');
        const content = this.panel.querySelector('.wizard-security-content');

        if (toggle) toggle.classList.toggle('expanded', this.state.data.showSecuritySetup);
        if (content) content.classList.toggle('expanded', this.state.data.showSecuritySetup);
    }

    updatePassphraseStrength() {
        const passphrase = this.panel.querySelector('#passphrase').value;
        const container = this.panel.querySelector('#strengthContainer');
        const fill = this.panel.querySelector('#strengthFill');
        const text = this.panel.querySelector('#strengthText');

        if (!passphrase) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';

        let strength = 'weak';
        let score = 0;

        if (passphrase.length >= 8) score++;
        if (passphrase.length >= 12) score++;
        if (/[A-Z]/.test(passphrase)) score++;
        if (/[0-9]/.test(passphrase)) score++;
        if (/[^A-Za-z0-9]/.test(passphrase)) score++;

        if (score <= 1) strength = 'weak';
        else if (score === 2) strength = 'fair';
        else if (score === 3) strength = 'good';
        else strength = 'strong';

        fill.className = `wizard-strength-fill ${strength}`;
        text.className = `wizard-strength-text ${strength}`;
        text.textContent = strength.charAt(0).toUpperCase() + strength.slice(1);
    }

    toggleAcknowledgment() {
        this.state.data.acknowledgmentChecked = !this.state.data.acknowledgmentChecked;

        const ack = this.panel.querySelector('.wizard-acknowledgment');
        const btn = this.panel.querySelector('.wizard-security-enable-btn');

        ack.classList.toggle('checked', this.state.data.acknowledgmentChecked);
        btn.disabled = !this.state.data.acknowledgmentChecked;

        this.saveState();
    }

    async savePasskey() {
        if (!this.state.data.encryptionEnabled) {
            Toast.show('Enable encryption first', { type: 'info' });
            return;
        }

        if (typeof Passkey === 'undefined' || !Passkey.isSupported()) {
            Toast.show('Passkeys not supported in this browser', { type: 'error' });
            return;
        }

        try {
            // Show loading state
            const btn = this.panel.querySelector('.wizard-passkey-card button');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Registering...';
            }

            const result = await Passkey.registerCredential();

            if (result && result.success !== false) {
                this.state.data.passkeyRegistered = true;
                this.saveState();
                Toast.show('Passkey saved successfully');
                // Re-render to show success state
                this.renderStep(7);
            } else {
                throw new Error(result?.error || 'Registration failed');
            }
        } catch (e) {
            console.error('Failed to register passkey:', e);
            Toast.show('Failed to save passkey: ' + e.message, { type: 'error' });

            // Reset button
            const btn = this.panel.querySelector('.wizard-passkey-card button');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Save Passkey';
            }
        }
    }

    async enableEncryption() {
        const passphrase = this.panel.querySelector('#passphrase')?.value;
        const confirm = this.panel.querySelector('#passphraseConfirm')?.value;

        if (!passphrase || passphrase.length < 8) {
            Toast.show('Passphrase must be at least 8 characters', { type: 'error' });
            return;
        }

        if (passphrase !== confirm) {
            Toast.show('Passphrases do not match', { type: 'error' });
            return;
        }

        // Show loading state
        const btn = this.panel.querySelector('#enableEncryptionBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Setting up...';
        }

        try {
            if (typeof Crypto === 'undefined' || !Crypto.setupEncryption) {
                throw new Error('Encryption module not loaded');
            }

            // Generate salt, derive key, create test value
            const { salt, testValue } = await Crypto.setupEncryption(passphrase);

            // Update button text
            if (btn) btn.textContent = 'Encrypting data...';

            // Fetch all content to encrypt
            const contentResponse = await fetch('/api/tasks/all-content');
            if (!contentResponse.ok) {
                throw new Error('Failed to fetch data');
            }
            const allContent = await contentResponse.json();

            // Encrypt all content
            const encrypted = await Crypto.encryptAllData(allContent.tasks, allContent.domains);

            // Save encrypted data to server
            if (encrypted.tasks.length > 0) {
                const taskResponse = await fetch('/api/tasks/batch-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tasks: encrypted.tasks })
                });
                if (!taskResponse.ok) {
                    throw new Error('Failed to save encrypted tasks');
                }
            }

            if (encrypted.domains.length > 0) {
                const domainResponse = await fetch('/api/domains/batch-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domains: encrypted.domains })
                });
                if (!domainResponse.ok) {
                    throw new Error('Failed to save encrypted domains');
                }
            }

            // Enable encryption on server
            const response = await fetch('/api/preferences/encryption/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ salt, test_value: testValue })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to enable encryption');
            }

            this.state.data.encryptionEnabled = true;
            this.saveState();
            Toast.show('Encryption enabled successfully');

            // Re-render step to show success state
            this.renderStep(7);
            this.updateNavigation();
        } catch (e) {
            console.error('Failed to enable encryption:', e);
            Toast.show('Failed to enable encryption: ' + e.message, { type: 'error' });

            // Reset button
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Enable Encryption';
            }
        }
    }

    renderStep8() {
        const recap = [];

        if (this.state.data.calendarConnected) {
            recap.push({ text: 'Calendar connected', done: true });
        } else {
            recap.push({ text: 'Calendar not connected', done: false });
        }

        if (this.state.data.importResult) {
            recap.push({ text: `${this.state.data.importResult.tasksImported} tasks imported`, done: true });
        } else {
            recap.push({ text: 'Ready for your first task', done: true });
        }

        recap.push({ text: `${this.state.data.domains.length} domains created`, done: true });

        if (this.state.data.encryptionEnabled) {
            recap.push({ text: 'Encryption enabled', done: true });
        }

        return `
            <div class="wizard-step-content" style="text-align: center;">
                <div class="wizard-ready-emoji">&#127881;</div>

                <h1 class="wizard-title">YOU'RE ALL SET</h1>

                <div class="wizard-recap-list">
                    ${recap.map(item => `
                        <div class="wizard-recap-item ${item.done ? '' : 'skipped'}">
                            <span class="wizard-recap-check">${item.done ? '&#10003;' : '&#9675;'}</span>
                            <span>${item.text}</span>
                        </div>
                    `).join('')}
                </div>

                <p class="wizard-ready-tagline">Time to plan your day.</p>

                ${this.renderProgress()}
            </div>
        `;
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    renderProgress() {
        const steps = [1, 2, 3, 4, 5, 6, 7, 8];
        const optional = [3, 5, 7]; // Optional steps

        return `
            <div class="wizard-progress">
                ${steps.map(step => {
                    const classes = ['wizard-progress-dot'];

                    if (step === this.state.currentStep) {
                        classes.push('current');
                    } else if (this.state.completedSteps.includes(step)) {
                        classes.push('completed');
                    }

                    if (optional.includes(step)) {
                        classes.push('optional');
                    }

                    return `<div class="${classes.join(' ')}" data-step="${step}"></div>`;
                }).join('')}
            </div>
        `;
    }

    renderSwipeHint() {
        return `
            <div class="wizard-swipe-hint">
                <svg class="wizard-swipe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M15 19l-7-7 7-7"/>
                </svg>
                <span>Swipe to go back</span>
            </div>
        `;
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// =============================================================================
// Initialize
// =============================================================================

let wizard;

document.addEventListener('DOMContentLoaded', () => {
    if (window.WHENDOIST?.showWizard) {
        wizard = new WhenWizard();
    }
});
