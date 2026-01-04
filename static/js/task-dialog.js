/**
 * Task Dialog Module
 *
 * Provides add/edit modal for native tasks.
 * Triggered by: "+" button, click task, keyboard "q"
 */
(function () {
    'use strict';

    let dialogEl = null;
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
        { value: 'executable', label: 'Executable', description: 'Can do tired' },
        { value: 'defined', label: 'Defined', description: 'Needs focus' },
        { value: 'exploratory', label: 'Exploratory', description: 'Needs thinking' },
    ];

    function init() {
        createDialog();
        setupEventListeners();
        loadDomains();
    }

    function createDialog() {
        dialogEl = document.createElement('dialog');
        dialogEl.className = 'task-dialog';
        dialogEl.innerHTML = `
            <form method="dialog" class="task-dialog-form">
                <div class="task-dialog-body">
                    <input type="text" name="title" class="task-title-input" placeholder="Task name" required autofocus>
                    <textarea name="description" class="task-desc-input" placeholder="Description" rows="1"></textarea>

                    <div class="task-chips">
                        <button type="button" class="chip chip-schedule" data-chip="schedule">
                            <span class="chip-icon">📅</span>
                            <span class="chip-text">Schedule</span>
                        </button>
                        <button type="button" class="chip chip-due" data-chip="due">
                            <span class="chip-icon">🎯</span>
                            <span class="chip-text">Due</span>
                        </button>
                        <button type="button" class="chip chip-duration" data-chip="duration">
                            <span class="chip-icon">⏱</span>
                            <span class="chip-text">Duration</span>
                        </button>
                        <button type="button" class="chip chip-more" data-chip="more">
                            <span class="chip-icon">•••</span>
                        </button>
                    </div>

                    <!-- Expandable sections -->
                    <div class="chip-expand" id="expand-schedule" style="display:none;">
                        <input type="date" name="scheduled_date" class="inline-input">
                        <input type="time" name="scheduled_time" class="inline-input">
                    </div>

                    <div class="chip-expand" id="expand-due" style="display:none;">
                        <input type="date" name="due_date" class="inline-input">
                    </div>

                    <div class="chip-expand" id="expand-duration" style="display:none;">
                        <div class="duration-picker">
                            ${DURATION_PRESETS.map(d =>
                                `<button type="button" class="duration-btn" data-duration="${d}">${d >= 60 ? d / 60 + 'h' : d + 'm'}</button>`
                            ).join('')}
                            <input type="number" name="duration_minutes" placeholder="min" min="5" max="480" class="duration-custom">
                        </div>
                    </div>

                    <div class="chip-expand" id="expand-more" style="display:none;">
                        <div class="more-section">
                            <span class="more-label">Impact</span>
                            <div class="impact-selector">
                                ${IMPACT_OPTIONS.map(opt =>
                                    `<button type="button" class="impact-btn" data-impact="${opt.value}" title="${opt.description}">${opt.label}</button>`
                                ).join('')}
                            </div>
                        </div>
                        <div class="more-section">
                            <span class="more-label">Clarity</span>
                            <div class="clarity-selector">
                                ${CLARITY_OPTIONS.map(opt =>
                                    `<button type="button" class="clarity-btn" data-clarity="${opt.value}" title="${opt.description}">${opt.label}</button>`
                                ).join('')}
                            </div>
                        </div>
                        <div class="more-section">
                            <span class="more-label">Recurrence</span>
                            <div class="recurrence-picker" id="recurrence-picker"></div>
                        </div>
                    </div>

                    <input type="hidden" name="impact" value="4">
                    <input type="hidden" name="clarity" value="defined">
                </div>

                <footer class="task-dialog-footer">
                    <div class="footer-left">
                        <select name="domain_id" class="domain-select">
                            <option value="">📥 Inbox</option>
                        </select>
                        <button type="button" class="btn-unschedule" id="btn-unschedule" style="display: none;">Unschedule</button>
                        <button type="button" class="btn-delete" id="btn-delete" style="display: none;">🗑️ Delete</button>
                    </div>
                    <div class="footer-right">
                        <button type="button" class="btn-cancel">Cancel</button>
                        <button type="submit" class="btn-submit">Add task</button>
                    </div>
                </footer>
            </form>
        `;
        document.body.appendChild(dialogEl);
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
            // Click on scheduled task in calendar (any scheduled task with a task ID)
            const scheduledTask = e.target.closest('.scheduled-task[data-task-id]');
            if (scheduledTask && !e.target.closest('a, button, input')) {
                e.preventDefault();
                const taskId = parseInt(scheduledTask.dataset.taskId, 10);
                if (taskId) {
                    openDialog(taskId);
                }
            }
        });

        // Keyboard shortcut "q" for quick add
        document.addEventListener('keydown', (e) => {
            if (e.key === 'q' && !e.target.matches('input, textarea, select') && !dialogEl.open) {
                e.preventDefault();
                openDialog();
            }
            // Escape to close
            if (e.key === 'Escape' && dialogEl.open) {
                closeDialog();
            }
        });

        // Dialog internal events
        dialogEl.querySelector('.btn-cancel').addEventListener('click', closeDialog);
        dialogEl.querySelector('form').addEventListener('submit', handleSubmit);
        dialogEl.querySelector('#btn-unschedule').addEventListener('click', handleUnschedule);
        dialogEl.querySelector('#btn-delete').addEventListener('click', handleDelete);

        // Click outside to close
        dialogEl.addEventListener('click', (e) => {
            if (e.target === dialogEl) {
                closeDialog();
            }
        });

        // Chip toggles for expandable sections
        dialogEl.querySelectorAll('.chip[data-chip]').forEach(chip => {
            chip.addEventListener('click', () => {
                const chipType = chip.dataset.chip;
                const expandEl = dialogEl.querySelector(`#expand-${chipType}`);
                if (expandEl) {
                    const isVisible = expandEl.style.display !== 'none';
                    // Hide all expand sections
                    dialogEl.querySelectorAll('.chip-expand').forEach(el => el.style.display = 'none');
                    dialogEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
                    // Toggle this one
                    if (!isVisible) {
                        expandEl.style.display = 'flex';
                        chip.classList.add('active');
                    }
                }
            });
        });

        // Duration preset buttons
        dialogEl.querySelectorAll('.duration-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const duration = parseInt(btn.dataset.duration, 10);
                dialogEl.querySelector('[name="duration_minutes"]').value = duration;
                dialogEl.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Update chip text
                const chipText = dialogEl.querySelector('.chip-duration .chip-text');
                if (chipText) chipText.textContent = duration >= 60 ? `${duration/60}h` : `${duration}m`;
            });
        });

        // Impact buttons
        dialogEl.querySelectorAll('.impact-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                dialogEl.querySelector('[name="impact"]').value = btn.dataset.impact;
                dialogEl.querySelectorAll('.impact-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Clarity buttons
        dialogEl.querySelectorAll('.clarity-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Toggle: click again to deselect
                const currentVal = dialogEl.querySelector('[name="clarity"]').value;
                if (currentVal === btn.dataset.clarity) {
                    dialogEl.querySelector('[name="clarity"]').value = '';
                    btn.classList.remove('active');
                } else {
                    dialogEl.querySelector('[name="clarity"]').value = btn.dataset.clarity;
                    dialogEl.querySelectorAll('.clarity-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });
        });
    }

    async function loadDomains() {
        try {
            const response = await fetch('/api/domains');
            if (response.ok) {
                domains = await response.json();
                updateDomainSelect();
            }
        } catch (err) {
            console.error('Failed to load domains:', err);
        }
    }

    function updateDomainSelect() {
        const select = dialogEl.querySelector('[name="domain_id"]');
        select.innerHTML = '<option value="">📥 Inbox</option>' +
            domains.map(d => `<option value="${d.id}">${d.icon || '📁'} ${d.name}</option>`).join('');
    }

    function openDialog(taskId = null) {
        currentTaskId = taskId;
        const form = dialogEl.querySelector('form');
        form.reset();

        // Reset button states
        dialogEl.querySelectorAll('.duration-btn, .impact-btn, .clarity-btn, .chip').forEach(b => b.classList.remove('active'));

        // Hide all expand sections
        dialogEl.querySelectorAll('.chip-expand').forEach(el => el.style.display = 'none');

        // Reset chip texts
        const durationChip = dialogEl.querySelector('.chip-duration .chip-text');
        if (durationChip) durationChip.textContent = 'Duration';
        const scheduleChip = dialogEl.querySelector('.chip-schedule .chip-text');
        if (scheduleChip) scheduleChip.textContent = 'Schedule';
        const dueChip = dialogEl.querySelector('.chip-due .chip-text');
        if (dueChip) dueChip.textContent = 'Due';

        // Set default impact
        dialogEl.querySelector('[name="impact"]').value = '4';
        dialogEl.querySelector('.impact-btn[data-impact="4"]').classList.add('active');

        // Set default clarity to "defined" for new tasks
        if (!taskId) {
            dialogEl.querySelector('[name="clarity"]').value = 'defined';
            dialogEl.querySelector('.clarity-btn[data-clarity="defined"]')?.classList.add('active');
        }

        // Update submit button text
        dialogEl.querySelector('.btn-submit').textContent = taskId ? 'Save' : 'Add task';

        // Hide unschedule and delete buttons for new tasks
        dialogEl.querySelector('#btn-unschedule').style.display = 'none';
        dialogEl.querySelector('#btn-delete').style.display = 'none';

        // Initialize recurrence picker
        if (window.RecurrencePicker) {
            window.RecurrencePicker.init(dialogEl.querySelector('#recurrence-picker'));
            window.RecurrencePicker.reset();
        }

        if (taskId) {
            loadTask(taskId);
        }

        dialogEl.showModal();
        dialogEl.querySelector('[name="title"]').focus();
    }

    function closeDialog() {
        dialogEl.close();
        currentTaskId = null;
    }

    async function loadTask(taskId) {
        try {
            const response = await fetch(`/api/tasks/${taskId}`);
            if (!response.ok) {
                throw new Error('Task not found');
            }
            const task = await response.json();

            const form = dialogEl.querySelector('form');
            form.elements.title.value = task.title;
            form.elements.description.value = task.description || '';
            form.elements.domain_id.value = task.domain_id || '';
            form.elements.scheduled_date.value = task.scheduled_date || '';
            form.elements.scheduled_time.value = task.scheduled_time || '';
            form.elements.due_date.value = task.due_date || '';
            form.elements.duration_minutes.value = task.duration_minutes || '';
            form.elements.impact.value = task.impact;
            form.elements.clarity.value = task.clarity || '';

            // Update button states
            dialogEl.querySelectorAll('.duration-btn').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.duration, 10) === task.duration_minutes);
            });
            dialogEl.querySelectorAll('.impact-btn').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.impact, 10) === task.impact);
            });
            dialogEl.querySelectorAll('.clarity-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.clarity === task.clarity);
            });

            // Show expand sections and update chip text if values exist
            if (task.scheduled_date) {
                dialogEl.querySelector('#expand-schedule').style.display = 'flex';
                dialogEl.querySelector('.chip-schedule').classList.add('active');
                const scheduleChip = dialogEl.querySelector('.chip-schedule .chip-text');
                if (scheduleChip) scheduleChip.textContent = task.scheduled_date;
            }
            if (task.due_date) {
                dialogEl.querySelector('#expand-due').style.display = 'flex';
                dialogEl.querySelector('.chip-due').classList.add('active');
                const dueChip = dialogEl.querySelector('.chip-due .chip-text');
                if (dueChip) dueChip.textContent = task.due_date;
            }
            if (task.duration_minutes) {
                dialogEl.querySelector('#expand-duration').style.display = 'flex';
                dialogEl.querySelector('.chip-duration').classList.add('active');
                const durationChip = dialogEl.querySelector('.chip-duration .chip-text');
                if (durationChip) {
                    durationChip.textContent = task.duration_minutes >= 60
                        ? `${task.duration_minutes/60}h`
                        : `${task.duration_minutes}m`;
                }
            }

            // Set recurrence
            if (window.RecurrencePicker && task.is_recurring && task.recurrence_rule) {
                window.RecurrencePicker.setRule(task.recurrence_rule);
            }

            // Show unschedule button if task is scheduled
            const unscheduleBtn = dialogEl.querySelector('#btn-unschedule');
            if (task.scheduled_date && task.scheduled_time) {
                unscheduleBtn.style.display = 'block';
            } else {
                unscheduleBtn.style.display = 'none';
            }

            // Show delete button for existing tasks
            dialogEl.querySelector('#btn-delete').style.display = 'block';
        } catch (err) {
            console.error('Failed to load task:', err);
            closeDialog();
        }
    }

    async function handleUnschedule() {
        if (!currentTaskId || isNaN(currentTaskId)) {
            console.error('Cannot unschedule: invalid task ID', currentTaskId);
            return;
        }

        const taskId = currentTaskId; // Capture before closing dialog

        // Close dialog immediately for instant feedback
        closeDialog();

        // Find and remove ALL task elements from calendar for this task (handles duplicates)
        const taskElements = document.querySelectorAll(`.scheduled-task[data-task-id="${taskId}"]`);
        const elementsToRestore = [];

        taskElements.forEach(el => {
            const parent = el.parentElement;
            const dayCalendar = el.closest('.day-calendar');
            elementsToRestore.push({ el, parent, dayCalendar });
            el.remove();
            if (dayCalendar && window.recalculateOverlaps) {
                window.recalculateOverlaps(dayCalendar);
            }
        });

        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scheduled_date: null,
                    scheduled_time: null,
                }),
            });

            if (response.ok) {
                // Check if task exists in task list
                const taskInList = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
                if (taskInList) {
                    // Just remove the scheduled styling
                    taskInList.classList.remove('scheduled');
                } else {
                    // Task doesn't exist in task list (was DB-scheduled), need to reload
                    window.location.reload();
                }
            } else {
                const error = await response.json();
                // Restore elements on failure
                elementsToRestore.forEach(({ el, parent, dayCalendar }) => {
                    if (parent) {
                        parent.appendChild(el);
                        if (dayCalendar && window.recalculateOverlaps) {
                            window.recalculateOverlaps(dayCalendar);
                        }
                    }
                });
                alert(error.detail || 'Failed to unschedule task');
            }
        } catch (err) {
            console.error('Failed to unschedule task:', err);
            // Restore elements on failure
            elementsToRestore.forEach(({ el, parent, dayCalendar }) => {
                if (parent) {
                    parent.appendChild(el);
                    if (dayCalendar && window.recalculateOverlaps) {
                        window.recalculateOverlaps(dayCalendar);
                    }
                }
            });
            alert('Failed to unschedule task. Please try again.');
        }
    }

    async function handleDelete() {
        if (!currentTaskId || isNaN(currentTaskId)) {
            console.error('Cannot delete: invalid task ID', currentTaskId);
            return;
        }

        if (!confirm('Delete this task?')) {
            return;
        }

        const taskId = currentTaskId;
        closeDialog();

        // Remove task from UI immediately
        const taskElements = document.querySelectorAll(`[data-task-id="${taskId}"]`);
        const removedElements = [];
        taskElements.forEach(el => {
            const parent = el.parentElement;
            const dayCalendar = el.closest('.day-calendar');
            removedElements.push({ el, parent, dayCalendar });
            el.remove();
            if (dayCalendar && window.recalculateOverlaps) {
                window.recalculateOverlaps(dayCalendar);
            }
        });

        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                // Restore elements on failure
                removedElements.forEach(({ el, parent, dayCalendar }) => {
                    if (parent) {
                        parent.appendChild(el);
                        if (dayCalendar && window.recalculateOverlaps) {
                            window.recalculateOverlaps(dayCalendar);
                        }
                    }
                });
                alert('Failed to delete task');
            }
        } catch (err) {
            console.error('Failed to delete task:', err);
            // Restore elements on failure
            removedElements.forEach(({ el, parent, dayCalendar }) => {
                if (parent) {
                    parent.appendChild(el);
                    if (dayCalendar && window.recalculateOverlaps) {
                        window.recalculateOverlaps(dayCalendar);
                    }
                }
            });
            alert('Failed to delete task. Please try again.');
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();

        const form = e.target;
        const formData = new FormData(form);

        // Get recurrence rule from picker
        let recurrenceRule = null;
        let isRecurring = false;
        if (window.RecurrencePicker) {
            recurrenceRule = window.RecurrencePicker.getRule();
            isRecurring = recurrenceRule !== null;
        }

        const data = {
            title: formData.get('title'),
            description: formData.get('description') || null,
            domain_id: formData.get('domain_id') ? parseInt(formData.get('domain_id'), 10) : null,
            scheduled_date: formData.get('scheduled_date') || null,
            scheduled_time: formData.get('scheduled_time') || null,
            due_date: formData.get('due_date') || null,
            duration_minutes: formData.get('duration_minutes') ? parseInt(formData.get('duration_minutes'), 10) : null,
            impact: parseInt(formData.get('impact'), 10) || 4,
            clarity: formData.get('clarity') || null,
            is_recurring: isRecurring,
            recurrence_rule: recurrenceRule,
        };

        const method = currentTaskId ? 'PUT' : 'POST';
        const url = currentTaskId ? `/api/tasks/${currentTaskId}` : '/api/tasks';

        try {
            const submitBtn = dialogEl.querySelector('.btn-submit');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (response.ok) {
                closeDialog();
                // Reload page to show updated tasks
                window.location.reload();
            } else {
                const error = await response.json();
                alert(error.detail || 'Failed to save task');
                submitBtn.disabled = false;
                submitBtn.textContent = currentTaskId ? 'Save Changes' : 'Add Task';
            }
        } catch (err) {
            console.error('Failed to save task:', err);
            alert('Failed to save task. Please try again.');
            const submitBtn = dialogEl.querySelector('.btn-submit');
            submitBtn.disabled = false;
            submitBtn.textContent = currentTaskId ? 'Save Changes' : 'Add Task';
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
