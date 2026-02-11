/**
 * Sticky Domain Label
 * On mobile, shows the current domain/project name merged into the
 * task-list-header as the user scrolls through domain sections.
 *
 * The label progressively reveals proportional to scroll position:
 * - progress=0 when the project-header top touches the sticky header bottom
 * - progress=1 when the project-header bottom passes behind the sticky header
 * - Near domain boundaries, an exit-fade reduces progress so the label
 *   crossfades smoothly when scrolling in either direction.
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
    var scrollContainer = document.querySelector('.tasks-panel');
    if (!label || !header || !scrollContainer) return;

    var ticking = false;
    var currentDomainId = null;

    function update() {
        ticking = false;
        var headerBottom = header.getBoundingClientRect().bottom;
        var groups = scrollContainer.querySelectorAll('.project-group');
        var activeGroup = null;
        var activeIndex = -1;

        for (var i = 0; i < groups.length; i++) {
            var rect = groups[i].getBoundingClientRect();
            // Group is active if it spans the header's bottom edge
            if (rect.top <= headerBottom && rect.bottom > headerBottom) {
                activeGroup = groups[i];
                activeIndex = i;
                break;
            }
        }

        if (activeGroup) {
            var domainId = activeGroup.dataset.domainId || '';

            // Enter progress: how far the active group's header has gone behind
            // the sticky header. Starts when header TOP touches (progress=0),
            // reaches 1 when header BOTTOM passes behind (fully hidden).
            var ph = activeGroup.querySelector('.project-header');
            var enterProgress = 0;
            if (ph) {
                var phRect = ph.getBoundingClientRect();
                var distance = headerBottom - phRect.top;
                enterProgress = Math.max(0, Math.min(1, distance / phRect.height));
            }

            var progress = enterProgress;

            // Exit fade: when the NEXT group's header is near the sticky header
            // edge from below, reduce progress for a smooth crossfade at domain
            // boundaries. This handles scrolling up (returning to a previous
            // domain) gracefully — the label fades in proportionally as the next
            // group's header moves away, instead of snapping to full opacity.
            var nextGroup = groups[activeIndex + 1];
            if (nextGroup) {
                var nextPh = nextGroup.querySelector('.project-header');
                if (nextPh) {
                    var nextPhRect = nextPh.getBoundingClientRect();
                    var gap = nextPhRect.top - headerBottom;
                    if (gap >= 0 && gap < nextPhRect.height) {
                        progress = Math.min(progress, gap / nextPhRect.height);
                    }
                }
            }

            // Only swap text content when domain changes (optimization)
            if (domainId !== currentDomainId) {
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
            }

            // Drive opacity and flex-grow from scroll progress every frame
            label.style.opacity = 0.85 * progress;
            label.style.flexGrow = progress;
        } else {
            if (currentDomainId !== null) {
                currentDomainId = null;
                label.classList.remove('active');
                label.textContent = '';
                label.style.opacity = 0;
                label.style.flexGrow = 0;
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
