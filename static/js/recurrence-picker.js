/**
 * Recurrence Picker Module
 *
 * UI component for building recurrence rules.
 * Returns a JSON object compatible with the backend recurrence_rule format.
 */
(function () {
    'use strict';

    let containerEl = null;
    let _originalRule = null;

    const PRESETS = [
        { label: 'None', value: null },
        { label: 'Daily', value: { freq: 'daily', interval: 1 } },
        { label: 'Weekdays', value: { freq: 'weekly', interval: 1, days_of_week: ['MO', 'TU', 'WE', 'TH', 'FR'] } },
        { label: 'Weekly', value: { freq: 'weekly', interval: 1 } },
        { label: 'Monthly', value: { freq: 'monthly', interval: 1 } },
        { label: 'Custom', value: 'custom' },
    ];

    const DAYS_OF_WEEK = [
        { value: 'MO', label: 'Mon' },
        { value: 'TU', label: 'Tue' },
        { value: 'WE', label: 'Wed' },
        { value: 'TH', label: 'Thu' },
        { value: 'FR', label: 'Fri' },
        { value: 'SA', label: 'Sat' },
        { value: 'SU', label: 'Sun' },
    ];

    function init(container) {
        containerEl = container;
        render();
        setupEventListeners();
    }

    function render() {
        containerEl.innerHTML = `
            <div class="recurrence-presets">
                ${PRESETS.map((p, i) =>
                    `<button type="button" class="recurrence-preset" data-index="${i}">${p.label}</button>`
                ).join('')}
            </div>
            <div class="recurrence-custom" style="display: none;">
                <div class="custom-row">
                    <label>Every</label>
                    <input type="number" name="interval" min="1" max="99" value="1" class="interval-input">
                    <select name="freq" class="freq-select">
                        <option value="daily">day(s)</option>
                        <option value="weekly">week(s)</option>
                        <option value="monthly">month(s)</option>
                        <option value="yearly">year(s)</option>
                    </select>
                </div>
                <div class="custom-row days-row" style="display: none;">
                    <label>On</label>
                    <div class="days-of-week">
                        ${DAYS_OF_WEEK.map(d =>
                            `<label class="day-checkbox">
                                <input type="checkbox" name="days_of_week" value="${d.value}">
                                <span>${d.label}</span>
                            </label>`
                        ).join('')}
                    </div>
                </div>
                <div class="custom-row day-of-month-row" style="display: none;">
                    <label>On day</label>
                    <input type="number" name="day_of_month" min="1" max="31" value="1" class="day-of-month-input">
                </div>
                <div class="custom-row time-row">
                    <label>At</label>
                    <input type="time" name="recurrence_time" class="recurrence-time-input">
                </div>
            </div>
            <div class="recurrence-preview"></div>
        `;
    }

    function setupEventListeners() {
        // Preset buttons
        containerEl.querySelectorAll('.recurrence-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index, 10);
                const preset = PRESETS[index];

                // Update active state
                containerEl.querySelectorAll('.recurrence-preset').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Show/hide custom section
                const customSection = containerEl.querySelector('.recurrence-custom');
                if (preset.value === 'custom') {
                    customSection.style.display = 'block';
                } else {
                    customSection.style.display = 'none';
                }

                updatePreview();
            });
        });

        // Frequency change
        const freqSelect = containerEl.querySelector('.freq-select');
        freqSelect.addEventListener('change', () => {
            const freq = freqSelect.value;
            const daysRow = containerEl.querySelector('.days-row');
            const dayOfMonthRow = containerEl.querySelector('.day-of-month-row');

            daysRow.style.display = freq === 'weekly' ? 'flex' : 'none';
            dayOfMonthRow.style.display = freq === 'monthly' ? 'flex' : 'none';

            updatePreview();
        });

        // Other inputs
        containerEl.querySelector('.interval-input').addEventListener('change', updatePreview);
        containerEl.querySelector('.day-of-month-input')?.addEventListener('change', updatePreview);
        containerEl.querySelector('.recurrence-time-input')?.addEventListener('change', updatePreview);
        containerEl.querySelectorAll('[name="days_of_week"]').forEach(cb => {
            cb.addEventListener('change', updatePreview);
        });
    }

    function getRule() {
        const activePreset = containerEl.querySelector('.recurrence-preset.active');
        if (!activePreset) return null;

        const index = parseInt(activePreset.dataset.index, 10);
        const preset = PRESETS[index];

        if (preset.value === null) return null;
        if (preset.value !== 'custom') {
            const rule = { ...preset.value };
            const timeInput = containerEl.querySelector('.recurrence-time-input');
            if (timeInput && timeInput.value) {
                rule.time = timeInput.value;
            }
            // Merge preserved fields from original rule
            if (_originalRule) {
                if (_originalRule.week_of_month !== undefined && rule.freq === 'monthly') {
                    rule.week_of_month = _originalRule.week_of_month;
                }
                if (_originalRule.month_of_year !== undefined && rule.freq === 'yearly') {
                    rule.month_of_year = _originalRule.month_of_year;
                }
            }
            // For "Weekly" preset, inject today's day of week if no days specified
            if (rule.freq === 'weekly' && !rule.days_of_week) {
                const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
                rule.days_of_week = [dayMap[new Date().getDay()]];
            }
            return rule;
        }

        // Custom rule
        const freq = containerEl.querySelector('.freq-select').value;
        const interval = parseInt(containerEl.querySelector('.interval-input').value, 10) || 1;

        const rule = { freq, interval };

        // Days of week for weekly
        if (freq === 'weekly') {
            const selectedDays = Array.from(containerEl.querySelectorAll('[name="days_of_week"]:checked'))
                .map(cb => cb.value);
            if (selectedDays.length > 0) {
                rule.days_of_week = selectedDays;
            }
        }

        // Day of month for monthly
        if (freq === 'monthly') {
            const dayOfMonth = parseInt(containerEl.querySelector('.day-of-month-input').value, 10);
            if (dayOfMonth >= 1 && dayOfMonth <= 31) {
                rule.day_of_month = dayOfMonth;
            }
        }

        // Time
        const timeInput = containerEl.querySelector('.recurrence-time-input');
        if (timeInput && timeInput.value) {
            rule.time = timeInput.value;
        }

        // Merge preserved fields from original rule that the UI doesn't expose
        if (_originalRule) {
            if (_originalRule.week_of_month !== undefined && rule.freq === 'monthly' && !rule.day_of_month) {
                rule.week_of_month = _originalRule.week_of_month;
            }
            if (_originalRule.month_of_year !== undefined && rule.freq === 'yearly') {
                rule.month_of_year = _originalRule.month_of_year;
            }
        }

        return rule;
    }

    function setRule(rule) {
        _originalRule = rule ? { ...rule } : null;

        if (!rule) {
            reset();
            return;
        }

        // Try to match a preset
        let matchedIndex = -1;
        for (let i = 0; i < PRESETS.length - 1; i++) {
            const preset = PRESETS[i];
            if (preset.value && JSON.stringify(preset.value) === JSON.stringify({ freq: rule.freq, interval: rule.interval, ...(rule.days_of_week && { days_of_week: rule.days_of_week }) })) {
                matchedIndex = i;
                break;
            }
        }

        if (matchedIndex === -1) {
            // Custom
            matchedIndex = PRESETS.length - 1;
            containerEl.querySelector('.recurrence-custom').style.display = 'block';
            containerEl.querySelector('.freq-select').value = rule.freq;
            containerEl.querySelector('.interval-input').value = rule.interval || 1;

            if (rule.freq === 'weekly') {
                containerEl.querySelector('.days-row').style.display = 'flex';
                if (rule.days_of_week) {
                    rule.days_of_week.forEach(day => {
                        const cb = containerEl.querySelector(`[name="days_of_week"][value="${day}"]`);
                        if (cb) cb.checked = true;
                    });
                }
            }

            if (rule.freq === 'monthly') {
                containerEl.querySelector('.day-of-month-row').style.display = 'flex';
                if (rule.day_of_month) {
                    containerEl.querySelector('.day-of-month-input').value = rule.day_of_month;
                }
            }
        }

        // Set time if present
        if (rule.time) {
            containerEl.querySelector('.recurrence-time-input').value = rule.time;
        }

        // Update active preset
        containerEl.querySelectorAll('.recurrence-preset').forEach((btn, i) => {
            btn.classList.toggle('active', i === matchedIndex);
        });

        updatePreview();
    }

    function reset() {
        _originalRule = null;
        containerEl.querySelectorAll('.recurrence-preset').forEach(btn => btn.classList.remove('active'));
        containerEl.querySelector('.recurrence-preset').classList.add('active'); // "None"
        containerEl.querySelector('.recurrence-custom').style.display = 'none';
        containerEl.querySelector('.freq-select').value = 'daily';
        containerEl.querySelector('.interval-input').value = 1;
        containerEl.querySelectorAll('[name="days_of_week"]').forEach(cb => cb.checked = false);
        if (containerEl.querySelector('.day-of-month-input')) {
            containerEl.querySelector('.day-of-month-input').value = 1;
        }
        if (containerEl.querySelector('.recurrence-time-input')) {
            containerEl.querySelector('.recurrence-time-input').value = '';
        }
        updatePreview();
    }

    function updatePreview() {
        const rule = getRule();
        const previewEl = containerEl.querySelector('.recurrence-preview');

        if (!rule) {
            previewEl.textContent = '';
            return;
        }

        let text = '';
        const interval = rule.interval || 1;

        switch (rule.freq) {
            case 'daily':
                text = interval === 1 ? 'Every day' : `Every ${interval} days`;
                break;
            case 'weekly':
                if (rule.days_of_week && rule.days_of_week.length > 0) {
                    const dayLabels = rule.days_of_week.map(d =>
                        DAYS_OF_WEEK.find(day => day.value === d)?.label || d
                    );
                    text = interval === 1
                        ? `Every ${dayLabels.join(', ')}`
                        : `Every ${interval} weeks on ${dayLabels.join(', ')}`;
                } else {
                    text = interval === 1 ? 'Every week' : `Every ${interval} weeks`;
                }
                break;
            case 'monthly':
                if (rule.day_of_month) {
                    text = interval === 1
                        ? `Every month on the ${ordinal(rule.day_of_month)}`
                        : `Every ${interval} months on the ${ordinal(rule.day_of_month)}`;
                } else {
                    text = interval === 1 ? 'Every month' : `Every ${interval} months`;
                }
                break;
            case 'yearly':
                text = interval === 1 ? 'Every year' : `Every ${interval} years`;
                break;
        }

        if (rule.time) {
            text += ` at ${rule.time}`;
        }

        previewEl.textContent = text;
    }

    function ordinal(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    // Export
    window.RecurrencePicker = {
        init,
        getRule,
        setRule,
        reset,
    };
})();
