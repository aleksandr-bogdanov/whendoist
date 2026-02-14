/**
 * Task Mutations Module
 *
 * Central module for in-place DOM updates after task operations.
 * Eliminates page reloads by surgically patching task elements.
 *
 * @module TaskMutations
 */
(function() {
    'use strict';

    // ======================================================================
    // HELPERS
    // ======================================================================

    /**
     * Format duration in minutes to human-readable string.
     * @param {number|null} minutes
     * @returns {string} e.g. "1h", "1h30m", "45m", or "\u2014"
     */
    function formatDuration(minutes) {
        if (!minutes) return '\u2014';
        if (minutes >= 60) {
            var h = Math.floor(minutes / 60);
            var m = minutes % 60;
            return h + 'h' + (m ? m + 'm' : '');
        }
        return minutes + 'm';
    }

    /**
     * Format impact number to label.
     * @param {number} impact
     * @returns {string}
     */
    function formatImpact(impact) {
        switch (impact) {
            case 1: return 'High';
            case 2: return 'Mid';
            case 3: return 'Low';
            default: return 'Min';
        }
    }

    /**
     * Format clarity value to label.
     * @param {string} clarity
     * @returns {string}
     */
    function formatClarity(clarity) {
        if (clarity === 'autopilot') return 'Autopilot';
        if (clarity === 'brainstorm') return 'Brainstorm';
        return '';
    }

    /**
     * Check if a value looks like encrypted data.
     * @param {string} value
     * @returns {boolean}
     */
    function looksEncrypted(value) {
        if (!value || value.length < 38) return false;
        return /^[A-Za-z0-9+/]+=*$/.test(value);
    }

    /**
     * Decrypt a field if encryption is active and value looks encrypted.
     * @param {string} value
     * @returns {Promise<string>}
     */
    async function maybeDecrypt(value) {
        if (!value) return value;
        if (typeof Crypto !== 'undefined' && Crypto.canCrypto && Crypto.canCrypto() && looksEncrypted(value)) {
            try {
                return await Crypto.decryptField(value);
            } catch (e) {
                console.error('Failed to decrypt field:', e);
                return value;
            }
        }
        return value;
    }

    // ======================================================================
    // DOM PATCHING
    // ======================================================================

    /**
     * Patch a task element's data attributes and visible text from API response.
     * @param {HTMLElement} taskEl
     * @param {Object} taskData - JSON response from PUT /api/v1/tasks/{id}
     */
    async function patchTaskElement(taskEl, taskData) {
        // Update data attributes
        if (taskData.clarity !== undefined) taskEl.dataset.clarity = taskData.clarity || '';
        if (taskData.impact !== undefined) {
            taskEl.dataset.impact = taskData.impact || 4;
            // Update impact CSS class
            taskEl.className = taskEl.className.replace(/\bimpact-\d\b/g, '');
            taskEl.classList.add('impact-' + (taskData.impact || 4));
        }
        if (taskData.duration_minutes !== undefined) {
            taskEl.dataset.duration = taskData.duration_minutes || '';
        }
        if (taskData.scheduled_date !== undefined) {
            taskEl.dataset.scheduledDate = taskData.scheduled_date || '';
            if (taskData.scheduled_date) {
                taskEl.classList.add('scheduled');
            } else {
                taskEl.classList.remove('scheduled');
            }
        }
        if (taskData.status !== undefined) {
            var isCompleted = taskData.status === 'completed';
            taskEl.dataset.completed = isCompleted ? '1' : '0';
        }
        if (taskData.completed_at !== undefined) {
            taskEl.dataset.completedAt = taskData.completed_at || '';
        }
        if (taskData.is_recurring !== undefined) {
            taskEl.dataset.isRecurring = taskData.is_recurring ? 'true' : 'false';
        }
        if (taskData.title !== undefined) {
            taskEl.dataset.title = taskData.title;
        }
        if (taskData.domain_id !== undefined) {
            taskEl.dataset.domainId = taskData.domain_id || '';
        }

        // Update draggable based on scheduled state and subtask count
        var hasSubtasks = parseInt(taskEl.dataset.subtaskCount || '0', 10) > 0;
        if (!taskEl.dataset.scheduledDate && !hasSubtasks) {
            taskEl.setAttribute('draggable', 'true');
        } else {
            taskEl.removeAttribute('draggable');
        }

        // Update visible text
        var displayTitle = await maybeDecrypt(taskData.title || taskEl.dataset.title);
        if (displayTitle) {
            var taskText = taskEl.querySelector('.task-text');
            if (taskText) taskText.textContent = displayTitle;
        }

        // Update clarity display
        var metaClarity = taskEl.querySelector('.meta-clarity');
        if (metaClarity && taskData.clarity !== undefined) {
            metaClarity.textContent = formatClarity(taskData.clarity);
            metaClarity.className = 'meta-clarity clarity-' + (taskData.clarity || '');
        }

        // Update duration display
        var metaDuration = taskEl.querySelector('.meta-duration');
        if (metaDuration && taskData.duration_minutes !== undefined) {
            metaDuration.textContent = formatDuration(taskData.duration_minutes);
        }

        // Update impact display
        var metaImpact = taskEl.querySelector('.meta-impact');
        if (metaImpact && taskData.impact !== undefined) {
            metaImpact.textContent = formatImpact(taskData.impact || 4);
            metaImpact.className = 'meta-impact impact-' + (taskData.impact || 4);
        }

        // Update scheduled date label
        if (taskData.scheduled_date !== undefined && typeof updateTaskScheduledDate === 'function') {
            updateTaskScheduledDate(taskEl, taskData.scheduled_date);
        }
    }

    /**
     * Move a task element between domain groups.
     * @param {HTMLElement} taskEl
     * @param {string|number} newDomainId
     */
    function moveBetweenDomainGroups(taskEl, newDomainId) {
        var targetGroup = document.querySelector('.project-group[data-domain-id="' + (newDomainId || 'inbox') + '"]');
        if (!targetGroup) {
            // Domain group doesn't exist — fallback to full refresh
            if (window.TaskComplete && typeof TaskComplete.refreshTaskList === 'function') {
                TaskComplete.refreshTaskList();
            }
            return;
        }

        insertIntoDomainGroup(taskEl, targetGroup);
    }

    /**
     * Insert a task element into a domain group (before the add-task-row).
     * @param {HTMLElement} taskEl
     * @param {HTMLElement} groupEl - The .project-group details element
     */
    function insertIntoDomainGroup(taskEl, groupEl) {
        var taskList = groupEl.querySelector('.task-list');
        if (!taskList) return;

        // Update source section count
        updateSectionCount(taskEl.closest('.project-group') || taskEl.closest('.section-group'));

        var addTaskRow = taskList.querySelector('.add-task-row');
        if (addTaskRow) {
            taskList.insertBefore(taskEl, addTaskRow);
        } else {
            taskList.appendChild(taskEl);
        }

        // Update target section count
        updateSectionCount(groupEl);
    }

    /**
     * Update the task/section count badge in a group or section.
     * @param {HTMLElement|null} sectionEl
     */
    function updateSectionCount(sectionEl) {
        if (!sectionEl) return;

        var countEl = sectionEl.querySelector('.task-count') || sectionEl.querySelector('.section-count');
        if (!countEl) return;

        var taskItems = sectionEl.querySelectorAll('.task-item');
        countEl.textContent = taskItems.length;
    }

    // ======================================================================
    // PUBLIC API
    // ======================================================================

    /**
     * Update a task in-place after editing.
     * Patches DOM, handles section moves, re-sorts, scrolls+highlights.
     *
     * @param {string|number} taskId
     * @param {Object} taskData - JSON response from the API
     */
    async function updateTaskInPlace(taskId, taskData) {
        var taskEl = document.querySelector('.task-item[data-task-id="' + taskId + '"]');
        if (!taskEl) return null; // Not in DOM (e.g. calendar-only view)

        var oldDomainId = taskEl.dataset.domainId || '';
        var oldScheduledDate = taskEl.dataset.scheduledDate || '';

        await patchTaskElement(taskEl, taskData);

        var newDomainId = String(taskData.domain_id || '');
        var newScheduledDate = taskData.scheduled_date || '';

        // Handle domain change
        if (taskData.domain_id !== undefined && oldDomainId !== newDomainId) {
            moveBetweenDomainGroups(taskEl, taskData.domain_id);
        }

        // Handle scheduled/unscheduled transitions
        if (taskData.scheduled_date !== undefined) {
            if (!oldScheduledDate && newScheduledDate) {
                // Became scheduled
                if (typeof moveTaskToScheduledSection === 'function') {
                    moveTaskToScheduledSection(taskEl);
                }
                // Show confirmation toast
                if (window.Toast) {
                    var taskText = taskEl.querySelector('.task-text');
                    var title = taskText ? taskText.textContent.trim() : 'Task';
                    var date = new Date(newScheduledDate + 'T00:00:00');
                    var formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    Toast.success('Scheduled "' + title + '" for ' + formatted);
                }
            } else if (oldScheduledDate && !newScheduledDate) {
                // Became unscheduled
                if (taskEl.closest('#section-sched')) {
                    moveFromScheduledToDomain(taskEl);
                } else if (typeof moveTaskToUnscheduledSection === 'function') {
                    moveTaskToUnscheduledSection(taskEl);
                }
            }
        }

        // Re-sort
        if (window.TaskSort && typeof TaskSort.applySort === 'function') {
            TaskSort.applySort();
        }

        scrollToAndHighlight(taskEl);
        return taskEl;
    }

    /**
     * Insert a newly created task by fetching its server-rendered HTML.
     *
     * @param {string|number} taskId
     */
    async function insertNewTask(taskId) {
        try {
            var response = await safeFetch('/api/v1/task-item/' + taskId);
            var html = await response.text();

            // Parse the HTML fragment
            var temp = document.createElement('div');
            temp.innerHTML = html.trim();
            var taskEl = temp.querySelector('.task-item');
            if (!taskEl) return null;

            // Find the correct domain group
            var domainId = taskEl.dataset.domainId || '';
            var targetGroup = document.querySelector('.project-group[data-domain-id="' + (domainId || 'inbox') + '"]');

            if (!targetGroup) {
                // Domain group doesn't exist — fallback to full refresh
                if (window.TaskComplete && typeof TaskComplete.refreshTaskList === 'function') {
                    TaskComplete.refreshTaskList();
                }
                return null;
            }

            var taskList = targetGroup.querySelector('.task-list');
            if (!taskList) return null;

            var addTaskRow = taskList.querySelector('.add-task-row');
            if (addTaskRow) {
                taskList.insertBefore(taskEl, addTaskRow);
            } else {
                taskList.appendChild(taskEl);
            }

            // Update section count
            updateSectionCount(targetGroup);

            // If the new task is scheduled, move it to the scheduled section
            var scheduledDate = taskEl.dataset.scheduledDate || '';
            if (scheduledDate) {
                ensureScheduledSectionExists();
                if (typeof moveTaskToScheduledSection === 'function') {
                    moveTaskToScheduledSection(taskEl);
                }
            }

            // Decrypt if encryption is active
            if (typeof Crypto !== 'undefined' && Crypto.canCrypto && Crypto.canCrypto()) {
                var title = taskEl.dataset.title;
                if (title && looksEncrypted(title)) {
                    try {
                        var decrypted = await Crypto.decryptField(title);
                        var textEl = taskEl.querySelector('.task-text');
                        if (textEl && decrypted) textEl.textContent = decrypted;
                    } catch (e) {
                        console.error('Failed to decrypt new task title:', e);
                    }
                }
            }

            // Init drag handlers on new element
            if (window.DragDrop && typeof DragDrop.initSingleTask === 'function') {
                DragDrop.initSingleTask(taskEl);
            }

            // Re-sort
            if (window.TaskSort && typeof TaskSort.applySort === 'function') {
                TaskSort.applySort();
            }

            scrollToAndHighlight(taskEl);
            return taskEl;
        } catch (error) {
            console.error('Failed to insert new task:', error);
            // Fallback to full refresh
            if (window.TaskComplete && typeof TaskComplete.refreshTaskList === 'function') {
                TaskComplete.refreshTaskList();
            }
            return null;
        }
    }

    /**
     * Create #section-sched if it doesn't exist yet.
     * Mirrors moveTaskToCompleted's creation of #section-done.
     */
    function ensureScheduledSectionExists() {
        if (document.getElementById('section-sched')) return;

        var scrollContainer = document.getElementById('task-list-scroll');
        if (!scrollContainer) return;

        var section = document.createElement('details');
        section.className = 'section-group';
        section.id = 'section-sched';
        section.open = true;
        section.innerHTML =
            '<summary class="section-separator section-separator--sched">' +
                '<span class="sched-label-group">' +
                    '<span class="section-sep-label">Scheduled</span>' +
                    '<span class="section-count">0</span>' +
                    '<span class="past-badge" id="past-badge" hidden></span>' +
                    '<span class="sched-label-line"></span>' +
                    '<span class="sep-col-label">Date</span>' +
                '</span>' +
                '<span class="sep-col-label">Clarity</span>' +
                '<span class="sep-col-label">Dur</span>' +
                '<span class="sep-col-label">Impact</span>' +
                '<span class="sep-col-spacer"></span>' +
            '</summary>' +
            '<div class="section-tasks"></div>';

        // Insert before #section-done (or append at end)
        var doneSection = document.getElementById('section-done');
        if (doneSection) {
            scrollContainer.insertBefore(section, doneSection);
        } else {
            scrollContainer.appendChild(section);
        }
    }

    /**
     * Move a task element to the completed section.
     * @param {HTMLElement} taskEl
     */
    function moveTaskToCompleted(taskEl) {
        if (!taskEl) return;

        // Record source section for count update
        var sourceSection = taskEl.closest('.project-group') || taskEl.closest('.section-group');

        // Find or create the completed section
        var completedSection = document.getElementById('section-done');
        if (!completedSection) {
            // Create completed section if it doesn't exist
            var scrollContainer = document.getElementById('task-list-scroll');
            if (!scrollContainer) return;

            completedSection = document.createElement('details');
            completedSection.className = 'section-group';
            completedSection.id = 'section-done';
            completedSection.open = true;
            completedSection.innerHTML =
                '<summary class="section-separator">' +
                    '<span class="section-sep-label">Completed</span>' +
                    '<span class="section-count">0</span>' +
                '</summary>' +
                '<div class="section-tasks"></div>';
            scrollContainer.appendChild(completedSection);
        }

        var sectionTasks = completedSection.querySelector('.section-tasks');
        if (!sectionTasks) return;

        // Move element
        sectionTasks.prepend(taskEl);

        // Update counts
        updateSectionCount(sourceSection);
        updateSectionCount(completedSection);
    }

    /**
     * Move a task element from completed section back to its domain group.
     * @param {HTMLElement} taskEl
     * @param {string|number} domainId
     */
    function moveTaskToActive(taskEl, domainId) {
        if (!taskEl) return;

        var sourceSection = taskEl.closest('.section-group');

        var targetGroup = document.querySelector('.project-group[data-domain-id="' + (domainId || 'inbox') + '"]');
        if (!targetGroup) {
            // Domain group not in DOM — fallback
            if (window.TaskComplete && typeof TaskComplete.refreshTaskList === 'function') {
                TaskComplete.refreshTaskList();
            }
            return;
        }

        insertIntoDomainGroup(taskEl, targetGroup);
        updateSectionCount(sourceSection);
    }

    /**
     * Move a task from the scheduled section (#section-sched) to its domain group.
     * Handles the cross-section move that moveTaskToUnscheduledSection can't do.
     * @param {HTMLElement} taskEl
     */
    function moveFromScheduledToDomain(taskEl) {
        if (!taskEl) return;

        var domainId = taskEl.dataset.domainId || '';
        var sourceSection = taskEl.closest('.section-group');

        // Remove scheduled styling
        taskEl.classList.remove('scheduled');
        taskEl.dataset.scheduledDate = '';

        // Remove date label (non-recurring)
        if (taskEl.dataset.isRecurring !== 'true') {
            var taskDue = taskEl.querySelector('.task-due');
            if (taskDue) taskDue.remove();
        }

        // Make draggable again
        var hasSubtasks = parseInt(taskEl.dataset.subtaskCount || '0', 10) > 0;
        if (!hasSubtasks) {
            taskEl.setAttribute('draggable', 'true');
            if (window.DragDrop && typeof DragDrop.initSingleTask === 'function') {
                DragDrop.initSingleTask(taskEl);
            }
        }

        var targetGroup = document.querySelector('.project-group[data-domain-id="' + (domainId || 'inbox') + '"]');
        if (!targetGroup) {
            if (window.TaskComplete && typeof TaskComplete.refreshTaskList === 'function') {
                TaskComplete.refreshTaskList();
            }
            return;
        }

        insertIntoDomainGroup(taskEl, targetGroup);
        updateSectionCount(sourceSection);

        if (window.TaskSort && typeof TaskSort.applySort === 'function') {
            TaskSort.applySort();
        }
        scrollToAndHighlight(taskEl);
    }

    /**
     * Scroll to a task element and apply highlight animation.
     * @param {HTMLElement} taskEl
     */
    function scrollToAndHighlight(taskEl) {
        if (!taskEl) return;

        taskEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Remove previous animation if still running
        taskEl.classList.remove('just-updated');
        // Force reflow to restart animation
        taskEl.offsetHeight;
        taskEl.classList.add('just-updated');

        setTimeout(function() {
            taskEl.classList.remove('just-updated');
        }, 1200);
    }

    // ======================================================================
    // CALENDAR SYNC
    // ======================================================================

    /**
     * Update a task's calendar card after editing via the dialog.
     * Removes old card(s) and creates a new one at the correct position.
     *
     * @param {string|number} taskId
     * @param {Object} taskData - JSON response from PUT /api/v1/tasks/{id}
     */
    function updateCalendarItem(taskId, taskData) {
        // Remove all existing calendar cards for this task
        var oldCards = document.querySelectorAll('.scheduled-task[data-task-id="' + taskId + '"]');
        var affectedCalendars = [];
        oldCards.forEach(function(el) {
            var dayCal = el.closest('.day-calendar');
            if (dayCal && affectedCalendars.indexOf(dayCal) === -1) {
                affectedCalendars.push(dayCal);
            }
            el.remove();
        });

        // Also remove date-only cards
        var oldDateOnly = document.querySelectorAll('.date-only-task[data-task-id="' + taskId + '"]');
        oldDateOnly.forEach(function(el) { el.remove(); });

        // Recalculate overlaps on calendars that lost a card
        affectedCalendars.forEach(function(cal) {
            if (typeof recalculateOverlaps === 'function') {
                recalculateOverlaps(cal);
            }
        });

        // If the task is now scheduled with a time, create a new card
        if (taskData.scheduled_date && taskData.scheduled_time &&
            window.DragDrop && typeof DragDrop.createScheduledTaskElement === 'function') {

            // Parse time "HH:MM" or "HH:MM:SS"
            var timeParts = taskData.scheduled_time.split(':');
            var hour = parseInt(timeParts[0], 10);
            var minutes = parseInt(timeParts[1], 10);

            // Derive title — use decrypted display title from task-item if possible
            var displayTitle = taskData.title || '';
            var taskEl = document.querySelector('.task-item[data-task-id="' + taskId + '"]');
            if (taskEl) {
                var textEl = taskEl.querySelector('.task-text');
                if (textEl) displayTitle = textEl.textContent;
            }

            var duration = taskData.duration_minutes || 30;
            var impact = taskData.impact || 4;
            var completed = taskData.status === 'completed' ? '1' : '0';

            var newCard = DragDrop.createScheduledTaskElement(
                taskId, displayTitle, duration, hour, minutes,
                String(impact), completed
            );

            // Find the correct day-calendar and hour-row
            var startMins = hour * 60 + minutes;
            var dayCal = document.querySelector('.day-calendar[data-day="' + taskData.scheduled_date + '"]');
            if (dayCal) {
                var hourRow = dayCal.querySelector('.hour-row[data-hour="' + hour + '"]:not(.adjacent-day)');
                if (hourRow) {
                    var slot = hourRow.querySelector('.hour-slot');
                    if (slot) {
                        slot.appendChild(newCard);
                    }
                }
                recalculateOverlaps(dayCal);
            }
        }
    }

    // ======================================================================
    // EXPORTS
    // ======================================================================

    window.TaskMutations = {
        updateTaskInPlace: updateTaskInPlace,
        insertNewTask: insertNewTask,
        moveTaskToCompleted: moveTaskToCompleted,
        moveTaskToActive: moveTaskToActive,
        moveFromScheduledToDomain: moveFromScheduledToDomain,
        scrollToAndHighlight: scrollToAndHighlight,
        updateCalendarItem: updateCalendarItem,
        updateSectionCount: updateSectionCount,
    };
})();
