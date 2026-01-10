/**
 * Task Sheet Controller
 *
 * Manages the right-side sheet for task editing.
 * Handles URL state, dirty tracking, and history navigation.
 */
(function () {
  'use strict';

  const overlay = document.getElementById('sheet-overlay');
  const sheet = document.getElementById('task-sheet');
  const appRoot = document.getElementById('app');

  // State
  let lastActive = null;
  let dirty = false;
  let suppressNextPop = false;

  // Navigation tracking
  let backgroundUrl = null;
  let lastNavMode = 'push';
  let editorUrl = null;

  function isOpen() {
    return sheet && !sheet.classList.contains('hidden');
  }

  function markDirtyOnce(form) {
    const onDirty = () => { dirty = true; };
    form.addEventListener('input', onDirty, { once: true });
    form.addEventListener('change', onDirty, { once: true });
  }

  function setInert(el, value) {
    if (!el) return;
    if (value) {
      el.setAttribute('inert', '');
    } else {
      el.removeAttribute('inert');
    }
  }

  function openSheet(navMode) {
    if (!sheet || !overlay) return;

    // Capture background URL on first open
    if (!isOpen()) {
      backgroundUrl = window.location.pathname + window.location.search;
      lastActive = document.activeElement;
    }

    lastNavMode = navMode;

    // Show sheet and overlay
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    sheet.classList.remove('hidden');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sheet-open');
    setInert(appRoot, true);

    // Focus first input
    const first = sheet.querySelector('input, textarea, select, button');
    if (first) first.focus();

    // Only reset dirty on first open (push), not on validation re-renders (replace)
    if (navMode === 'push') {
      dirty = false;
    }

    // Mark form dirty on first edit
    const form = sheet.querySelector('form');
    if (form) markDirtyOnce(form);

    // Capture editor URL after swap
    editorUrl = window.location.pathname + window.location.search;
  }

  function hardClose() {
    if (!sheet || !overlay) return;

    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    sheet.classList.add('hidden');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML = '';
    document.body.classList.remove('sheet-open');
    setInert(appRoot, false);
    dirty = false;

    if (lastActive && lastActive.focus) lastActive.focus();
  }

  function confirmDiscard() {
    return window.confirm('Discard unsaved changes?');
  }

  function closeSheet(options = {}) {
    const { force = false } = options;

    if (!force && dirty && !confirmDiscard()) {
      return;
    }

    if (lastNavMode === 'push') {
      // Was a push, so we can go back
      history.back();
    } else {
      // Was a replace, so restore URL and close
      if (backgroundUrl) {
        history.replaceState({}, '', backgroundUrl);
      }
      hardClose();
    }
  }

  // Export API
  window.taskSheet = {
    open: openSheet,
    hardClose,
    close: closeSheet,
    isOpen
  };

  // Set push vs replace header for HTMX requests
  document.body.addEventListener('htmx:configRequest', (e) => {
    if (e.detail.target && e.detail.target.id === 'task-sheet') {
      const mode = isOpen() ? 'replace' : 'push';
      e.detail.headers['X-Whendoist-Sheet-Nav'] = mode;
    }
  });

  // After swap, open/update sheet
  document.body.addEventListener('htmx:afterSwap', (e) => {
    if (e.target && e.target.id === 'task-sheet') {
      const navMode = isOpen() ? 'replace' : 'push';
      openSheet(navMode);
    }
  });

  // Close buttons
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-sheet-close]')) {
      closeSheet();
    }
  });

  // Overlay click closes
  if (overlay) {
    overlay.addEventListener('click', () => closeSheet());
  }

  // Escape key closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      closeSheet();
    }
  });

  // Back/forward dirty guard
  window.addEventListener('popstate', () => {
    if (!isOpen()) return;

    if (suppressNextPop) {
      suppressNextPop = false;
      return;
    }

    if (dirty) {
      // Restore editor URL via pushState
      suppressNextPop = true;
      if (editorUrl) {
        history.pushState({}, '', editorUrl);
      }

      if (confirmDiscard()) {
        dirty = false;
        history.back();
      }
      return;
    }

    hardClose();
  });

  // Keyboard shortcut: N opens new task editor
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (e.key.toLowerCase() === 'n' &&
        !e.ctrlKey && !e.metaKey &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) &&
        !isOpen()) {
      const newTaskBtn = document.getElementById('new-task-btn');
      if (newTaskBtn) newTaskBtn.click();
    }
  });

  // Handle taskSaved event - close sheet and refresh UI
  document.body.addEventListener('taskSaved', (e) => {
    const d = e.detail || {};
    dirty = false;
    closeSheet({ force: true });

    // Patch affected domain sections
    const domains = Array.isArray(d.domains_to_refresh) ? d.domains_to_refresh : [];
    if (domains.length && typeof htmx !== 'undefined') {
      domains.forEach((domainId) => {
        const target = document.getElementById(`domain-${domainId}`);
        if (target) {
          htmx.ajax('GET', `/api/domains/${domainId}/section`, {
            target: `#domain-${domainId}`,
            swap: 'outerHTML'
          });
        }
      });

      // If none of the domains were in DOM, refresh list container
      const anyFound = domains.some(id => document.getElementById(`domain-${id}`));
      if (!anyFound) {
        const listScroll = document.getElementById('task-list-scroll');
        if (listScroll) {
          htmx.ajax('GET', '/api/tasks/list', { target: '#task-list-scroll', swap: 'innerHTML' });
        }
      }
      return;
    }

    // Fallback: refresh list
    if (typeof htmx !== 'undefined') {
      const listScroll = document.getElementById('task-list-scroll');
      if (listScroll) {
        htmx.ajax('GET', '/api/tasks/list', { target: '#task-list-scroll', swap: 'innerHTML' });
      }
    }

    // If no htmx or list scroll, reload page
    if (d.action === 'delete' || d.action === 'unschedule') {
      window.location.reload();
    }
  });

  // Handle quickTaskCreated event - open editor for new task
  document.body.addEventListener('quickTaskCreated', (e) => {
    const { id } = e.detail || {};
    if (!id || typeof htmx === 'undefined') return;
    htmx.ajax('GET', `/tasks/${id}`, { target: '#task-sheet', swap: 'innerHTML' });
  });

  // Handle HX-Trigger from server for taskSaved
  document.body.addEventListener('htmx:trigger', (e) => {
    if (e.detail.name === 'taskSaved') {
      document.body.dispatchEvent(new CustomEvent('taskSaved', {
        detail: e.detail.value
      }));
    }
    if (e.detail.name === 'quickTaskCreated') {
      document.body.dispatchEvent(new CustomEvent('quickTaskCreated', {
        detail: e.detail.value
      }));
    }
  });
})();
