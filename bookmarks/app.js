let bookmarks = [];
let selectedTags = new Set();
let searchQuery = '';
let selectedCategory = null;  // null = "All"
let selectedSection = null;
const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

async function loadBookmarks() {
    try {
        const response = await fetch('bookmarks.json');
        const data = await response.json();
        bookmarks = data.bookmarks;
        applyFiltersFromURL();
        render();
        setupEventListeners();
    } catch (error) {
        console.error('Error loading bookmarks:', error);
    }
}

function applyFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);
    const queryParam = params.get('q') || '';
    searchQuery = queryParam;

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = queryParam;
    }

    // Category and section from URL
    selectedCategory = params.get('category') || null;
    selectedSection = params.get('section') || null;

    // Validate: section requires matching category
    if (selectedSection && !selectedCategory) {
        selectedSection = null;
    }

    const tagValues = params.getAll('tag');
    const parsedTags = new Set();
    tagValues.forEach(value => {
        value.split(',').forEach(tag => {
            const trimmed = tag.trim();
            if (trimmed) parsedTags.add(trimmed);
        });
    });

    selectedTags = parsedTags;
}

function updateURLParams() {
    const params = new URLSearchParams();
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
        params.set('q', trimmedQuery);
    }

    // Add category and section to URL
    if (selectedCategory) {
        params.set('category', selectedCategory);
    }
    if (selectedSection) {
        params.set('section', selectedSection);
    }

    if (selectedTags.size > 0) {
        [...selectedTags].sort((a, b) => a.localeCompare(b)).forEach(tag => {
            params.append('tag', tag);
        });
    }

    const queryString = params.toString();
    const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
}

function getAllTags(bookmarkList) {
    const tagSet = new Set();
    bookmarkList.forEach(b => b.tags.forEach(t => tagSet.add(t)));
    return tagSet;
}

function getAllCategories() {
    const categorySet = new Set();
    bookmarks.forEach(b => {
        if (b.category) categorySet.add(b.category);
    });
    return [...categorySet].sort((a, b) => a.localeCompare(b));
}

function getSectionsForCategory(category) {
    const sectionSet = new Set();
    bookmarks.forEach(b => {
        if (b.category === category && b.section) {
            sectionSet.add(b.section);
        }
    });
    return [...sectionSet].sort((a, b) => a.localeCompare(b));
}

function getFilteredBookmarks() {
    let filtered = bookmarks;

    // Apply category filter
    if (selectedCategory) {
        filtered = filtered.filter(b => b.category === selectedCategory);
    }

    // Apply section filter (only if category is selected)
    if (selectedCategory && selectedSection) {
        filtered = filtered.filter(b => b.section === selectedSection);
    }

    // Apply search filter
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(b =>
            b.title.toLowerCase().includes(q) ||
            b.url.toLowerCase().includes(q) ||
            (b.description && b.description.toLowerCase().includes(q)) ||
            b.tags.some(t => t.toLowerCase().includes(q))
        );
    }

    // Apply tag filter (AND logic)
    if (selectedTags.size > 0) {
        filtered = filtered.filter(b =>
            [...selectedTags].every(tag => b.tags.includes(tag))
        );
    }

    return filtered;
}

function getTagCounts(bookmarkList) {
    const counts = {};
    bookmarkList.forEach(b => {
        b.tags.forEach(tag => {
            counts[tag] = (counts[tag] || 0) + 1;
        });
    });
    return counts;
}

function renderTagList() {
    const nav = document.getElementById('tag-list');
    const filtered = getFilteredBookmarks();
    const counts = getTagCounts(filtered);

    // Get all tags from full bookmark set for initial display
    const allTags = getAllTags(bookmarks);

    const tagData = [...allTags]
        .map(tag => ({ tag, count: counts[tag] || 0 }))
        .filter(({ tag, count }) => {
            if (selectedTags.has(tag)) return true;
            const hasActiveFilters = selectedTags.size > 0 || selectedCategory || searchQuery.trim();
            if (hasActiveFilters && count === 0) return false;
            return true;
        })
        .sort((a, b) => {
            const aSelected = selectedTags.has(a.tag) ? 1 : 0;
            const bSelected = selectedTags.has(b.tag) ? 1 : 0;
            if (aSelected !== bSelected) return bSelected - aSelected;
            if (b.count !== a.count) return b.count - a.count;
            return a.tag.localeCompare(b.tag);
        });

    const maxCount = tagData.reduce((max, { count }) => Math.max(max, count), 0);

    nav.innerHTML = tagData.map(({ tag, count }) => {
        const fill = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
        return `
        <button class="tag-item${selectedTags.has(tag) ? ' selected' : ''}" data-tag="${tag}" style="--tag-fill: ${fill}%">
            <span class="tag-label">${tag}</span>
            <span class="tag-count">${count}</span>
        </button>
    `;
    }).join('');

    // Update clear button visibility
    const clearBtn = document.getElementById('clear-filters');
    const hasFilters = selectedTags.size > 0 || selectedCategory !== null || searchQuery.trim();
    clearBtn.classList.toggle('hidden', !hasFilters);
}

function groupBookmarks(bookmarkList) {
    // Group by category, then by section
    const grouped = {};

    bookmarkList.forEach(b => {
        const cat = b.category || 'Uncategorized';
        const sec = b.section || '';

        if (!grouped[cat]) grouped[cat] = { noSection: [], sections: {} };

        if (sec) {
            if (!grouped[cat].sections[sec]) grouped[cat].sections[sec] = [];
            grouped[cat].sections[sec].push(b);
        } else {
            grouped[cat].noSection.push(b);
        }
    });

    return grouped;
}

function renderBookmarkCard(link, index) {
    const host = new URL(link.url).hostname;
    const title = searchQuery ? highlightMatch(link.title, searchQuery) : link.title;
    const desc = link.description || '';
    const badge = index < 9 ? `<span class="position-badge">${isMac ? '⌥' : 'Alt+'}${index + 1}</span>` : '';
    return `
        <a href="${link.url}" class="link-card" target="_blank" rel="noopener noreferrer">
            ${badge}
            <div class="link-left">
                <div class="link-favicon" aria-hidden="true">
                    <img data-favicon src="https://www.google.com/s2/favicons?domain=${host}&sz=32" alt="" loading="lazy">
                </div>
                <button class="copy-btn" data-url="${link.url}" data-title="${link.title.replace(/"/g, '&quot;')}" aria-label="Copy link">
                    <span class="material-icons">content_copy</span>
                </button>
            </div>
            <div class="link-info">
                <span class="link-title">${title}</span>
                <span class="link-url">${host}</span>
                ${desc ? `<span class="link-description">${desc}</span>` : ''}
                <span class="link-tags">${link.tags.map(t =>
                    `<span class="link-tag${selectedTags.has(t) ? ' active' : ''}">${t}</span>`
                ).join('')}</span>
            </div>
        </a>
    `;
}

async function copyLink(url, title) {
    const html = `<a href="${url}">${title}</a>`;
    const text = url;

    try {
        await navigator.clipboard.write([
            new ClipboardItem({
                'text/html': new Blob([html], { type: 'text/html' }),
                'text/plain': new Blob([text], { type: 'text/plain' })
            })
        ]);
        return true;
    } catch {
        // Fallback for browsers that don't support ClipboardItem
        await navigator.clipboard.writeText(url);
        return true;
    }
}

function renderBookmarks() {
    const grid = document.getElementById('bookmarks-grid');
    const noResults = document.getElementById('no-results');
    const filtered = getFilteredBookmarks();

    if (filtered.length === 0) {
        grid.classList.add('hidden');
        noResults.classList.remove('hidden');
        document.getElementById('bookmark-count').textContent = '0 bookmarks';
        return;
    }

    grid.classList.remove('hidden');
    noResults.classList.add('hidden');

    // Update sidebar title with count
    document.getElementById('bookmark-count').textContent = `${filtered.length} bookmark${filtered.length !== 1 ? 's' : ''}`;

    const grouped = groupBookmarks(filtered);
    const sortedCategories = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

    let html = '';
    let cardIndex = 0;

    sortedCategories.forEach(category => {
        const catData = grouped[category];
        html += `<div class="category-group">`;
        html += `<h1 class="category-heading">${category}</h1>`;

        // Render bookmarks without a section first (directly under category)
        if (catData.noSection.length > 0) {
            const sorted = catData.noSection.sort((a, b) => a.title.localeCompare(b.title));
            html += `<div class="links-grid">`;
            sorted.forEach(link => {
                html += renderBookmarkCard(link, cardIndex++);
            });
            html += `</div>`;
        }

        // Render sections
        const sortedSections = Object.keys(catData.sections).sort((a, b) => a.localeCompare(b));
        sortedSections.forEach(section => {
            const sectionBookmarks = catData.sections[section].sort((a, b) => a.title.localeCompare(b.title));
            html += `<h2 class="section-heading">${section}</h2>`;
            html += `<div class="links-grid">`;
            sectionBookmarks.forEach(link => {
                html += renderBookmarkCard(link, cardIndex++);
            });
            html += `</div>`;
        });

        html += `</div>`;
    });

    grid.innerHTML = html;
    wireFaviconFallback(grid);
}

function renderCategoryFilter() {
    const container = document.getElementById('category-filter');
    const categories = getAllCategories();

    let html = '';

    // "All" pill - always visible
    html += `<button class="filter-pill${!selectedCategory ? ' selected' : ''}" data-category="all">All</button>`;

    if (!selectedCategory) {
        // No category selected: show all category pills
        categories.forEach(cat => {
            html += `<button class="filter-pill" data-category="${cat}">${cat}</button>`;
        });
    } else {
        // Category selected: show only selected category + sections
        html += `<button class="filter-pill selected" data-category="${selectedCategory}">${selectedCategory}</button>`;

        // Get sections for selected category
        const sections = getSectionsForCategory(selectedCategory);

        if (sections.length > 0) {
            // Add visual divider
            html += `<span class="filter-divider"></span>`;

            // Section pills
            sections.forEach(sec => {
                const isSelected = selectedSection === sec;
                html += `<button class="filter-pill section-pill${isSelected ? ' selected' : ''}" data-section="${sec}">${sec}</button>`;
            });
        }
    }

    container.innerHTML = html;
    updateFilterScrollFade();
}

function updateFilterScrollFade() {
    const container = document.getElementById('category-filter');
    const wrapper = document.getElementById('category-filter-wrapper');
    const isAtEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 5;
    wrapper.classList.toggle('at-end', isAtEnd);
}

function selectCategory(category) {
    if (category === 'all' || category === selectedCategory) {
        // Clicking "All" or clicking selected category = reset
        selectedCategory = null;
        selectedSection = null;
    } else {
        selectedCategory = category;
        selectedSection = null;  // Reset section when changing category
    }
    updateURLParams();
    render();
}

function selectSection(section) {
    if (selectedSection === section) {
        // Toggle off
        selectedSection = null;
    } else {
        selectedSection = section;
    }
    updateURLParams();
    render();
}

function render() {
    renderCategoryFilter();
    renderTagList();
    renderBookmarks();
}

function toggleTag(tag) {
    if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
    } else {
        selectedTags.add(tag);
    }
    updateURLParams();
    render();
}

function clearFilters() {
    selectedTags.clear();
    selectedCategory = null;
    selectedSection = null;
    searchQuery = '';
    document.getElementById('search-input').value = '';
    updateURLParams();
    render();
}

function wireFaviconFallback(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('img[data-favicon]').forEach(img => {
        img.addEventListener('error', () => {
            const holder = img.closest('.link-favicon');
            if (!holder) return;
            holder.innerHTML = `<span class="material-icons link-fallback-icon">link</span>`;
        }, { once: true });
    });
}

function highlightMatch(text, query) {
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isEditableTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function isPrintableKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key.length !== 1) return false;
    if (e.key === ' ') return false;
    return true;
}

function setupEventListeners() {
    // Tag list click handler
    document.getElementById('tag-list').addEventListener('click', (e) => {
        const tagItem = e.target.closest('.tag-item');
        if (tagItem) {
            toggleTag(tagItem.dataset.tag);
        }
    });

    // Category/Section filter click handler
    const categoryFilter = document.getElementById('category-filter');
    categoryFilter.addEventListener('click', (e) => {
        const pill = e.target.closest('.filter-pill');
        if (!pill) return;

        if (pill.dataset.section) {
            selectSection(pill.dataset.section);
        } else if (pill.dataset.category) {
            selectCategory(pill.dataset.category);
        }
    });

    // Update fade indicator on scroll
    categoryFilter.addEventListener('scroll', updateFilterScrollFade);

    // Clear filters button
    document.getElementById('clear-filters').addEventListener('click', clearFilters);

    // Mobile tags toggle
    document.getElementById('toggle-tags').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('expanded');
    });

    // Search input
    const searchInput = document.getElementById('search-input');
    let debounceTimer;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            searchQuery = e.target.value;
            updateURLParams();
            render();
        }, 150);
    });

    // Action button handlers (delegated)
    document.getElementById('bookmarks-grid').addEventListener('click', async (e) => {
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            e.preventDefault();
            e.stopPropagation();
            const { url, title } = copyBtn.dataset;
            await copyLink(url, title);
            // Visual feedback
            const icon = copyBtn.querySelector('.material-icons');
            icon.textContent = 'check';
            setTimeout(() => {
                icon.textContent = 'content_copy';
            }, 1500);
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        const cards = document.querySelectorAll('.link-card');
        const isInSearch = document.activeElement === searchInput;

        // Escape - close help, clear filters, or blur search
        if (e.key === 'Escape') {
            const helpOverlay = document.getElementById('help-overlay');
            if (helpOverlay?.classList.contains('visible')) {
                helpOverlay.classList.remove('visible');
                return;
            }
            const hasAnyFilter = selectedTags.size > 0 || selectedCategory || searchQuery.trim();
            if (hasAnyFilter) {
                clearFilters();
            }
            searchInput.blur();
            return;
        }

        // Enter in search - open first result
        if (e.key === 'Enter' && isInSearch && cards.length > 0) {
            e.preventDefault();
            window.open(cards[0].href, '_blank', 'noopener,noreferrer');
            return;
        }

        // Skip other shortcuts if in editable field
        if (isEditableTarget(e.target) || isInSearch) return;

        // Alt/Option + 1-9 - open card at position
        if (e.altKey && e.key >= '1' && e.key <= '9') {
            const index = parseInt(e.key) - 1;
            if (cards[index]) {
                e.preventDefault();
                window.open(cards[index].href, '_blank', 'noopener,noreferrer');
            }
            return;
        }

        // Arrow keys - navigate within current context
        if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            const focused = document.activeElement;

            // Navigate within tag panel
            if (focused.classList.contains('tag-item')) {
                navigatePanel('.tag-item', e.key);
                return;
            }

            // Navigate within filter pills
            if (focused.classList.contains('filter-pill')) {
                navigatePanel('.filter-pill', e.key);
                return;
            }

            // Default: navigate cards
            navigateCards(e.key, cards);
            return;
        }

        // c - copy focused card's link
        if (e.key === 'c') {
            const focused = document.activeElement;
            if (focused.classList.contains('link-card')) {
                e.preventDefault();
                const copyBtn = focused.querySelector('.copy-btn');
                if (copyBtn) copyBtn.click();
            }
            return;
        }

        // t - focus tag panel
        if (e.key === 't') {
            e.preventDefault();
            const firstTag = document.querySelector('.tag-item');
            if (firstTag) firstTag.focus();
            return;
        }

        // f - focus category filter
        if (e.key === 'f') {
            e.preventDefault();
            const firstPill = document.querySelector('.filter-pill');
            if (firstPill) firstPill.focus();
            return;
        }

        // ? - toggle help overlay
        if (e.key === '?') {
            e.preventDefault();
            toggleHelpOverlay();
            return;
        }

        // / - focus search
        if (e.key === '/') {
            e.preventDefault();
            searchInput.focus();
            return;
        }

        // Printable keys - start typing in search
        if (isPrintableKey(e)) {
            e.preventDefault();
            searchInput.focus();
            searchInput.value += e.key;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
}

// Navigate between cards with arrow keys
function navigateCards(key, cards) {
    if (cards.length === 0) return;

    const focused = document.activeElement;
    const cardsArray = Array.from(cards);
    let currentIndex = cardsArray.indexOf(focused);

    // If no card focused, start from first
    if (currentIndex === -1) {
        cards[0].focus();
        cards[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
    }

    let nextIndex = currentIndex;

    // Left/Right: sequential navigation
    if (key === 'ArrowRight') {
        nextIndex = Math.min(currentIndex + 1, cards.length - 1);
    } else if (key === 'ArrowLeft') {
        nextIndex = Math.max(currentIndex - 1, 0);
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
        // Up/Down: find visually adjacent card using bounding rects
        const currentRect = focused.getBoundingClientRect();
        const currentCenterX = currentRect.left + currentRect.width / 2;
        const currentCenterY = currentRect.top + currentRect.height / 2;

        let bestIndex = -1;
        let bestDistance = Infinity;

        cardsArray.forEach((card, index) => {
            if (index === currentIndex) return;
            const rect = card.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // Check if card is in the right direction
            const isBelow = key === 'ArrowDown' && rect.top > currentRect.bottom - 5;
            const isAbove = key === 'ArrowUp' && rect.bottom < currentRect.top + 5;

            if (isBelow || isAbove) {
                // Prefer cards with similar horizontal position
                const horizontalDist = Math.abs(centerX - currentCenterX);
                const verticalDist = Math.abs(centerY - currentCenterY);
                // Weight horizontal distance more to prefer same-column cards
                const distance = horizontalDist * 2 + verticalDist;

                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestIndex = index;
                }
            }
        });

        if (bestIndex !== -1) {
            nextIndex = bestIndex;
        }
    }

    if (nextIndex !== currentIndex) {
        cards[nextIndex].focus();
        cards[nextIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

// Navigate within a panel (tags or filter pills)
function navigatePanel(selector, key) {
    const items = document.querySelectorAll(selector);
    if (items.length === 0) return;

    const focused = document.activeElement;
    let currentIndex = Array.from(items).indexOf(focused);

    if (currentIndex === -1) return;

    let nextIndex = currentIndex;

    if (key === 'ArrowDown' || key === 'ArrowRight') {
        nextIndex = Math.min(currentIndex + 1, items.length - 1);
    } else if (key === 'ArrowUp' || key === 'ArrowLeft') {
        nextIndex = Math.max(currentIndex - 1, 0);
    }

    if (nextIndex !== currentIndex) {
        items[nextIndex].focus();
        items[nextIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

// Toggle help overlay
function toggleHelpOverlay() {
    let overlay = document.getElementById('help-overlay');
    if (!overlay) {
        overlay = createHelpOverlay();
        document.body.appendChild(overlay);
    }
    overlay.classList.toggle('visible');
}

function createHelpOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'help-overlay';
    overlay.innerHTML = `
        <button class="help-trigger" aria-label="Keyboard shortcuts"><span class="material-icons">keyboard</span></button>
        <div class="help-content">
            <h3>Keyboard Shortcuts</h3>
            <div class="help-section">
                <h4>Quick Actions</h4>
                <div class="help-row"><kbd>/</kbd> <span>Focus search</span></div>
                <div class="help-row"><kbd>${isMac ? '⌥' : 'Alt+'}</kbd><kbd>1</kbd>-<kbd>9</kbd> <span>Open result #</span></div>
                <div class="help-row"><kbd>Enter</kbd> <span>Open first result (in search)</span></div>
                <div class="help-row"><kbd>Esc</kbd> <span>Clear filters / close</span></div>
            </div>
            <div class="help-section">
                <h4>Navigation</h4>
                <div class="help-row"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> <span>Navigate</span></div>
                <div class="help-row"><kbd>Enter</kbd> <span>Open focused card</span></div>
                <div class="help-row"><kbd>c</kbd> <span>Copy focused link</span></div>
            </div>
            <div class="help-section">
                <h4>Filters</h4>
                <div class="help-row"><kbd>t</kbd> <span>Focus tags</span></div>
                <div class="help-row"><kbd>f</kbd> <span>Focus categories</span></div>
            </div>
        </div>
    `;
    // Click trigger button to toggle
    overlay.querySelector('.help-trigger').addEventListener('click', () => {
        overlay.classList.toggle('visible');
    });
    // Click outside to close
    document.addEventListener('click', (e) => {
        if (overlay.classList.contains('visible') && !overlay.contains(e.target)) {
            overlay.classList.remove('visible');
        }
    });
    return overlay;
}

// Create help overlay on load
document.addEventListener('DOMContentLoaded', () => {
    const overlay = createHelpOverlay();
    document.body.appendChild(overlay);
});

document.addEventListener('DOMContentLoaded', loadBookmarks);
