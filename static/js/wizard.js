/**
 * WhenWizard - First-Run Onboarding
 *
 * Handles the 7-step onboarding wizard with:
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
                domains: []
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
            if (nextStep > 7) {
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
                    <button class="wizard-btn-primary wizard-btn-centered" onclick="wizard.goForward()">Get Started</button>
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
                        <button class="wizard-btn-secondary" onclick="wizard.skipStep()">Skip</button>
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
                        <button class="wizard-btn-secondary" onclick="wizard.skipStep()">Skip</button>
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
                // Button is now in the content area, nav is hidden
                navHTML = '';
                break;
        }

        nav.innerHTML = navHTML;
    }

    // =========================================================================
    // Step Renderers
    // =========================================================================

    renderStep1() {
        const userName = window.WHENDOIST?.userName || '';
        const firstName = userName.split(' ')[0];
        const greeting = firstName ? `Welcome, ${this.escapeHtml(firstName)}` : '';

        return `
            <div class="wizard-step-content wizard-step-welcome">
                <div class="wizard-welcome-hero">
                    <div class="wizard-welcome-logo">
                        <img src="/static/img/logo.png" alt="Whendoist">
                    </div>
                </div>

                ${greeting ? `<p class="wizard-welcome-greeting">${greeting}</p>` : ''}

                <div class="wizard-welcome-card">
                    <p class="wizard-welcome-line">Calendar shows when you're busy.</p>
                    <p class="wizard-welcome-line">Tasks show what to do.</p>
                    <p class="wizard-welcome-line wizard-welcome-punchline">Whendoist shows <em>when</em> to do it.</p>
                </div>

                ${this.renderProgress()}
            </div>
        `;
    }

    renderStep2() {
        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">Work with your energy</h1>
                <p class="wizard-subtitle">Filter tasks by how much focus they need</p>

                <div class="wizard-card">
                    <div class="wizard-mode-cards">
                        <div class="wizard-mode-card" data-mode="zombie">
                            <div class="wizard-mode-emoji">&#129503;</div>
                            <div class="wizard-mode-name">Zombie</div>
                            <div class="wizard-mode-description">Simple next actions</div>
                        </div>
                        <div class="wizard-mode-card selected" data-mode="normal">
                            <div class="wizard-mode-emoji">&#9749;</div>
                            <div class="wizard-mode-name">Normal</div>
                            <div class="wizard-mode-description">Routine work</div>
                        </div>
                        <div class="wizard-mode-card" data-mode="focus">
                            <div class="wizard-mode-emoji">&#129504;</div>
                            <div class="wizard-mode-name">Focus</div>
                            <div class="wizard-mode-description">Deep work / research</div>
                        </div>
                    </div>

                    <div class="wizard-preview-divider"></div>

                    <div class="wizard-section-title">Preview</div>
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
                        <div class="wizard-preview-task clarity-exploratory hidden" data-clarity="exploratory">
                            <span class="wizard-preview-task-title">Research competitor features</span>
                            <span class="wizard-preview-task-duration">2h</span>
                        </div>
                    </div>
                </div>

                ${this.renderProgress()}
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

        // Apply initial filter for default "normal" mode
        this.updateTaskPreview('normal');
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
        // Mask email for privacy: show first char + *** + @domain
        const maskedEmail = userEmail ? userEmail.replace(/^(.).*@/, '$1***@') : '';
        const events = this.state.data.cachedEvents || [];

        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">Connect your calendar</h1>
                <p class="wizard-subtitle">Plan tasks around your commitments</p>

                <div class="wizard-connection-card ${isConnected ? 'connected' : ''}">
                    <div class="wizard-connection-header">
                        <div class="wizard-gcal-icon-wrap ${isConnected ? 'connected' : ''}">
                            <svg class="wizard-gcal-logo" width="28" height="28" viewBox="0 0 24 24">
                                <rect x="2" y="4" width="20" height="18" rx="2" fill="#4285F4"/>
                                <rect x="2" y="4" width="20" height="5" fill="#1A73E8"/>
                                <rect x="6" y="2" width="2" height="4" rx="1" fill="#EA4335"/>
                                <rect x="16" y="2" width="2" height="4" rx="1" fill="#EA4335"/>
                                <rect x="6" y="12" width="3" height="3" rx="0.5" fill="white"/>
                                <rect x="10.5" y="12" width="3" height="3" rx="0.5" fill="white"/>
                                <rect x="15" y="12" width="3" height="3" rx="0.5" fill="white"/>
                                <rect x="6" y="16" width="3" height="3" rx="0.5" fill="white"/>
                                <rect x="10.5" y="16" width="3" height="3" rx="0.5" fill="white"/>
                            </svg>
                            ${isConnected ? '<span class="wizard-gcal-check">&#10003;</span>' : ''}
                        </div>
                        <div class="wizard-connection-info">
                            <div class="wizard-connection-name ${isConnected ? 'connected' : ''}">Google Calendar</div>
                            <div class="wizard-connection-status">
                                <span class="wizard-connection-dot ${isConnected ? 'connected' : ''}"></span>
                                <span>${isConnected ? 'Connected' : 'Not connected'}</span>
                                ${isConnected && maskedEmail ? `<span class="wizard-connection-email">· ${this.escapeHtml(maskedEmail)}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    ${isConnected && events.length > 0 ? `
                        <div class="wizard-event-preview">
                            ${events.slice(0, 3).map(event => `
                                <div class="wizard-event-row">
                                    <span class="wizard-event-dot" style="background: ${event.color || '#4285F4'}"></span>
                                    <span class="wizard-event-title">${this.escapeHtml(event.summary)}</span>
                                    <span class="wizard-event-time">${event.time}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    ${isConnected && events.length === 0 ? `
                        <div class="wizard-connection-success">
                            <span class="wizard-connection-success-text">Ready to read events and find free time</span>
                        </div>
                    ` : ''}

                    ${!isConnected ? `
                        <button class="wizard-btn-primary wizard-connect-btn" onclick="wizard.connectCalendar()">
                            Connect Google Calendar
                        </button>
                    ` : ''}
                </div>

                <p class="wizard-connection-privacy">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Reads your calendar to find free time. Never edits events.
                </p>

                ${this.renderProgress()}
            </div>
        `;
    }

    connectCalendar() {
        // Store current wizard state before redirecting
        this.saveState();
        // Redirect to Google OAuth with calendar scope
        window.location.href = '/auth/google?wizard=true';
    }

    // Pre-fetch calendars and events when connection status changes
    async prefetchCalendars() {
        if (this.state.data.calendarConnected) {
            try {
                // Fetch calendars if not cached
                if (!this.state.data.cachedCalendars) {
                    const response = await fetch('/api/calendars');
                    const calendars = await response.json();
                    this.state.data.cachedCalendars = calendars;
                }

                // Fetch upcoming events for preview (if not cached)
                if (!this.state.data.cachedEvents) {
                    const eventsResponse = await fetch('/api/events/upcoming?days=2&limit=3');
                    if (eventsResponse.ok) {
                        const events = await eventsResponse.json();
                        this.state.data.cachedEvents = events;
                    }
                }

                this.saveState();

                // Re-render step 3 if we're on it and just got events
                if (this.state.currentStep === 3) {
                    this.renderStep(3);
                }
            } catch (e) {
                console.error('Failed to prefetch calendar data:', e);
            }
        }
    }

    renderStep4() {
        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">Which calendars matter?</h1>
                <p class="wizard-subtitle">Selected calendars block time. Unselected calendars are ignored.</p>

                <div class="wizard-card">
                    <div class="wizard-calendar-list" id="calendarList">
                        <div style="text-align: center; padding: 20px; color: var(--text-muted);">
                            Loading calendars...
                        </div>
                    </div>
                    <div class="wizard-helper-links" id="calendarHelpers" style="display: none;">
                        <button class="wizard-helper-link" onclick="wizard.selectAllCalendars()">Select all</button>
                        <button class="wizard-helper-link" onclick="wizard.selectNoCalendars()">Select none</button>
                    </div>
                </div>

                ${this.renderProgress()}
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
            const helpers = this.panel.querySelector('#calendarHelpers');

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

            // Show helper links if there are multiple calendars
            if (helpers && calendars.length > 1) {
                helpers.style.display = 'flex';
            }

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
        if (this.state.data.importError) {
            return this.renderStep5Error();
        }
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
                <h1 class="wizard-title">Already have tasks?</h1>
                <p class="wizard-subtitle">Import from Todoist to start faster</p>

                <div class="wizard-import-source">
                    <svg class="wizard-todoist-logo" width="32" height="32" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="16" fill="#E44332"/>
                        <path d="M9 11h14l-7 4.5L9 11zm0 5h14l-7 4.5L9 16zm0 5h14l-7 4.5L9 21z" fill="white" opacity="0.9"/>
                    </svg>
                    <div class="wizard-import-title">Import from Todoist</div>
                    <div class="wizard-import-description">
                        Bring your projects, tasks, and labels
                    </div>
                    <button class="wizard-btn-primary" onclick="wizard.connectTodoist()">
                        Connect Todoist
                    </button>
                </div>

                ${this.renderProgress()}
            </div>
        `;
    }

    renderStep5Connected() {
        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">Todoist connected</h1>
                <p class="wizard-subtitle">Ready to import your tasks</p>

                <div class="wizard-import-source">
                    <div class="wizard-import-success-badge">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <div class="wizard-import-description">
                        Click below to import your projects and tasks
                    </div>
                    <button class="wizard-btn-primary" onclick="wizard.startTodoistImport()">
                        Import Tasks
                    </button>
                </div>

                ${this.renderProgress()}
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
            this.state.data.importError = e.message || 'Import failed';
            this.saveState();
            this.renderStep(5);
            this.updateNavigation();
        }
    }

    renderStep5Error() {
        return `
            <div class="wizard-step-content">
                <div class="wizard-error-illustration">
                    <img src="/static/img/illustrations/error-sync.svg" alt="" width="80" height="80" aria-hidden="true">
                </div>
                <h1 class="wizard-title">Import failed</h1>
                <p class="wizard-subtitle">Something went wrong connecting to Todoist</p>

                <div class="wizard-error-message">
                    ${this.escapeHtml(this.state.data.importError)}
                </div>

                <div class="wizard-error-actions">
                    <button class="wizard-btn-primary" onclick="wizard.retryTodoistImport()">
                        Try Again
                    </button>
                    <button class="wizard-btn-ghost" onclick="wizard.skipTodoistImport()">
                        Skip
                    </button>
                </div>

                ${this.renderProgress()}
            </div>
        `;
    }

    retryTodoistImport() {
        this.state.data.importError = null;
        this.saveState();
        this.renderStep(5);
        this.updateNavigation();
    }

    skipTodoistImport() {
        this.state.data.importError = null;
        this.saveState();
        this.next();
    }

    renderStep5Complete() {
        const result = this.state.data.importResult;
        const totalImported = (result.tasksImported || 0) + (result.projectsImported || 0);
        const isEmpty = totalImported === 0;

        if (isEmpty) {
            return `
                <div class="wizard-step-content">
                    <h1 class="wizard-title">Fresh start</h1>
                    <p class="wizard-subtitle">No tasks found in Todoist</p>

                    <div class="wizard-import-complete">
                        <p class="wizard-import-fresh-message">
                            That's okay — you're starting with a clean slate!
                        </p>

                        <p class="wizard-import-complete-note">
                            Create your first task after setup,<br>
                            or import from Todoist later in Settings.
                        </p>
                    </div>

                    ${this.renderProgress()}
                </div>
            `;
        }

        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">Import complete</h1>

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
        const suggestionNames = suggestions.map(s => s.name);

        // domains is now array of objects: [{name, icon}, ...]
        const selectedNames = this.state.data.domains.map(d => typeof d === 'string' ? d : d.name);
        const isAddingCustom = this.state.data.isAddingCustomDomain || false;

        // Get custom domains (those not in suggestions)
        const customDomains = this.state.data.domains
            .map(d => typeof d === 'string' ? { name: d, icon: '📁' } : d)
            .filter(d => !suggestionNames.includes(d.name));

        return `
            <div class="wizard-step-content">
                <h1 class="wizard-title">Organize your life</h1>
                <p class="wizard-subtitle">Domains are big areas of your life</p>

                <div class="wizard-card">
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
                                </div>
                            `;
                        }).join('')}

                        ${customDomains.map(d => `
                            <div class="wizard-domain-chip selected"
                                 data-domain="${this.escapeHtml(d.name)}"
                                 data-icon="${d.icon}"
                                 onclick="wizard.toggleDomain('${this.escapeHtml(d.name)}', '${d.icon}')">
                                <span class="wizard-domain-emoji">${d.icon}</span>
                                <span class="wizard-domain-name">${this.escapeHtml(d.name)}</span>
                            </div>
                        `).join('')}

                        <div class="wizard-domain-chip wizard-domain-chip-add" onclick="wizard.showAddDomain()">
                            <span class="wizard-domain-add-icon">+</span>
                            <span class="wizard-domain-name">Add your own</span>
                        </div>
                    </div>

                    ${isAddingCustom ? `
                        <div class="wizard-custom-domain-row">
                            <div class="wizard-emoji-picker-wrap">
                                <button type="button" class="wizard-emoji-btn" id="customDomainIcon" onclick="wizard.toggleEmojiPicker()">📁</button>
                                <div class="wizard-emoji-popover" id="emojiPopover"></div>
                            </div>
                            <input type="text"
                                   class="wizard-input wizard-domain-input"
                                   id="customDomainName"
                                   placeholder="Domain name..."
                                   maxlength="20"
                                   autofocus
                                   onkeydown="if(event.key === 'Enter') wizard.addCustomDomain(); if(event.key === 'Escape') wizard.hideAddDomain();">
                            <button class="wizard-btn-primary wizard-btn-sm" onclick="wizard.addCustomDomain()">Add</button>
                            <button class="wizard-btn-ghost wizard-btn-sm" onclick="wizard.hideAddDomain()">Cancel</button>
                        </div>
                    ` : ''}
                </div>

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
        this.state.data.isAddingCustomDomain = true;
        this.saveState();
        this.renderStep(6);
        this.updateNavigation();
        // Focus the input after re-render
        setTimeout(() => {
            const input = document.getElementById('customDomainName');
            if (input) input.focus();
        }, 50);
    }

    hideAddDomain() {
        this.state.data.isAddingCustomDomain = false;
        this.hideEmojiPicker();
        this.saveState();
        this.renderStep(6);
        this.updateNavigation();
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

        popover.innerHTML = WhenWizard.DOMAIN_EMOJIS.map(emoji =>
            `<button type="button" class="wizard-emoji-option" onclick="wizard.selectEmoji('${emoji}')">${emoji}</button>`
        ).join('');

        // Position is handled by CSS - popover is positioned relative to its container
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
        const name = input?.value?.trim();
        const icon = iconBtn?.textContent || '📁';

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

        // Add domain and reset state
        this.state.data.isAddingCustomDomain = false;
        this.toggleDomain(name, icon);
    }

    renderStep7() {
        // Step 7 is now the completion/ready step
        const recap = [];

        if (this.state.data.calendarConnected) {
            recap.push({ icon: '&#10003;', text: 'Calendar connected' });
        }

        if (this.state.data.importResult) {
            recap.push({ icon: '&#10003;', text: `${this.state.data.importResult.tasksImported} tasks imported` });
        }

        if (this.state.data.domains.length > 0) {
            recap.push({ icon: '&#10003;', text: `${this.state.data.domains.length} domains created` });
        }

        return `
            <div class="wizard-step-content wizard-step-ready">
                <div class="wizard-ready-illustration">
                    <img src="/static/img/illustrations/success-setup.svg" alt="" width="120" height="120" aria-hidden="true">
                </div>
                <h1 class="wizard-title">You're all set</h1>
                <p class="wizard-subtitle">Your day awaits</p>

                ${recap.length > 0 ? `
                    <div class="wizard-recap-list">
                        ${recap.map(item => `
                            <div class="wizard-recap-item">
                                <span class="wizard-recap-check">${item.icon}</span>
                                <span>${item.text}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <div class="wizard-final-cta">
                    <button class="wizard-btn-primary wizard-btn-final" onclick="wizard.complete()">
                        Open Dashboard
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    renderProgress() {
        // 7 steps now, optional are calendar (3) and todoist (5)
        const steps = [1, 2, 3, 4, 5, 6, 7];
        const optional = [3, 5];

        return `
            <div class="wizard-progress-container">
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

function initWizard() {
    if (window.WHENDOIST?.showWizard) {
        wizard = new WhenWizard();
    }
}

// Handle both cases: DOM already ready, or wait for it
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWizard);
} else {
    // DOM is already ready
    initWizard();
}
