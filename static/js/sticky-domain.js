/**
 * Sticky Domain Label
 * On mobile, shows the current domain/project name merged into the
 * task-list-header as the user scrolls through domain sections.
 *
 * Layout when scrolled into a domain:
 *   🎵 Music Hustle  13      CLARITY ↑  DUR  IMPACT
 *   ══════════════════════════════════════════════════  ← spectrum bar
 */
(function() {
    'use strict';

    // Only run on mobile
    if (!window.matchMedia('(max-width: 900px)').matches) return;

    var label = document.getElementById('header-domain-label');
    var header = document.querySelector('.task-list-header');
    var scrollContainer = document.querySelector('.task-list-container');
    if (!label || !header || !scrollContainer) return;

    var ticking = false;
    var currentDomainId = null;

    function update() {
        ticking = false;
        var headerBottom = header.getBoundingClientRect().bottom;
        var groups = scrollContainer.querySelectorAll('.project-group');
        var activeGroup = null;

        for (var i = 0; i < groups.length; i++) {
            var rect = groups[i].getBoundingClientRect();
            // Group is active if it spans the header's bottom edge
            if (rect.top <= headerBottom && rect.bottom > headerBottom) {
                activeGroup = groups[i];
                break;
            }
        }

        if (activeGroup) {
            var domainId = activeGroup.dataset.domainId || '';
            if (domainId === currentDomainId) return;
            currentDomainId = domainId;

            var projectName = activeGroup.querySelector('.project-name');
            var nameEl = activeGroup.querySelector('.domain-name-text');
            var countEl = activeGroup.querySelector('.task-count');

            // Extract emoji from text nodes before .domain-name-text
            var emoji = '';
            if (projectName && nameEl) {
                for (var j = 0; j < projectName.childNodes.length; j++) {
                    var node = projectName.childNodes[j];
                    if (node === nameEl) break;
                    if (node.nodeType === Node.TEXT_NODE) {
                        var text = node.textContent.trim();
                        if (text) { emoji = text; break; }
                    }
                }
            }

            var name = nameEl
                ? nameEl.textContent.trim()
                : (projectName ? projectName.textContent.trim() : '');
            var count = countEl ? countEl.textContent.trim() : '';

            label.textContent = '';
            label.appendChild(document.createTextNode((emoji ? emoji + ' ' : '') + name));
            if (count) {
                var countSpan = document.createElement('span');
                countSpan.className = 'header-domain-count';
                countSpan.textContent = count;
                label.appendChild(countSpan);
            }
            label.classList.add('active');
        } else {
            if (currentDomainId !== null) {
                currentDomainId = null;
                label.classList.remove('active');
                label.textContent = '';
            }
        }
    }

    scrollContainer.addEventListener('scroll', function() {
        if (!ticking) {
            requestAnimationFrame(update);
            ticking = true;
        }
    }, { passive: true });

    // Initial check
    requestAnimationFrame(update);
})();
