let bookmarks = [];
let selectedTags = new Set();
let searchQuery = '';

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

function getFilteredBookmarks() {
    let filtered = bookmarks;

    // Apply search filter first
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

    // Sort tags by count (descending), then alphabetically
    const sortedTags = [...allTags]
        .map(tag => ({ tag, count: counts[tag] || 0 }))
        .filter(({ count }) => selectedTags.size === 0 || count > 0 || selectedTags.has(count))
        .filter(({ tag, count }) => {
            // Always show selected tags, hide others with 0 count when filtering
            if (selectedTags.has(tag)) return true;
            if (selectedTags.size > 0 && count === 0) return false;
            return true;
        })
        .sort((a, b) => {
            // Selected tags first, then by count, then alphabetically
            const aSelected = selectedTags.has(a.tag) ? 1 : 0;
            const bSelected = selectedTags.has(b.tag) ? 1 : 0;
            if (aSelected !== bSelected) return bSelected - aSelected;
            if (b.count !== a.count) return b.count - a.count;
            return a.tag.localeCompare(b.tag);
        });

    nav.innerHTML = sortedTags.map(({ tag, count }) => `
        <button class="tag-item${selectedTags.has(tag) ? ' selected' : ''}" data-tag="${tag}">
            <span class="tag-label">${tag}</span>
            <span class="tag-count">${count}</span>
        </button>
    `).join('');

    // Update clear button visibility
    const clearBtn = document.getElementById('clear-filters');
    clearBtn.classList.toggle('hidden', selectedTags.size === 0);
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

function renderBookmarkCard(link) {
    const host = new URL(link.url).hostname;
    const title = searchQuery ? highlightMatch(link.title, searchQuery) : link.title;
    const desc = link.description || '';
    return `
        <a href="${link.url}" class="link-card">
            ${desc ? `<span class="link-tooltip">${desc}</span>` : ''}
            <div class="link-favicon" aria-hidden="true">
                <img data-favicon src="https://www.google.com/s2/favicons?domain=${host}&sz=32" alt="" loading="lazy">
            </div>
            <div class="link-info">
                <span class="link-title">${title}</span>
                <span class="link-url">${host}</span>
                ${desc ? `<span class="link-description">${desc}</span>` : ''}
                <span class="link-tags">${link.tags.map(t =>
                    `<span class="link-tag${selectedTags.has(t) ? ' active' : ''}">${t}</span>`
                ).join('')}</span>
            </div>
            <div class="link-actions">
                <button class="link-action open-new-btn" data-url="${link.url}" aria-label="Open in new tab">
                    <span class="material-icons">open_in_new</span>
                </button>
                <button class="link-action copy-btn" data-url="${link.url}" data-title="${link.title.replace(/"/g, '&quot;')}" aria-label="Copy link">
                    <span class="material-icons">link</span>
                </button>
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

    sortedCategories.forEach(category => {
        const catData = grouped[category];
        html += `<div class="category-group">`;
        html += `<h1 class="category-heading">${category}</h1>`;

        // Render bookmarks without a section first (directly under category)
        if (catData.noSection.length > 0) {
            const sorted = catData.noSection.sort((a, b) => a.title.localeCompare(b.title));
            html += `<div class="links-grid">`;
            sorted.forEach(link => {
                html += renderBookmarkCard(link);
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
                html += renderBookmarkCard(link);
            });
            html += `</div>`;
        });

        html += `</div>`;
    });

    grid.innerHTML = html;
    wireFaviconFallback(grid);
}

function render() {
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

    // Clear filters button
    document.getElementById('clear-filters').addEventListener('click', clearFilters);

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
        const openNewBtn = e.target.closest('.open-new-btn');
        if (openNewBtn) {
            e.preventDefault();
            e.stopPropagation();
            window.open(openNewBtn.dataset.url, '_blank', 'noopener,noreferrer');
            return;
        }

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
                icon.textContent = 'link';
            }, 1500);
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (selectedTags.size > 0) {
                clearFilters();
            } else if (searchInput.value) {
                searchInput.value = '';
                searchQuery = '';
                updateURLParams();
                render();
            }
            searchInput.blur();
            return;
        }

        if (isEditableTarget(e.target) || document.activeElement === searchInput) return;

        if (e.key === '/') {
            e.preventDefault();
            searchInput.focus();
            return;
        }

        if (isPrintableKey(e)) {
            e.preventDefault();
            searchInput.focus();
            searchInput.value += e.key;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
}

document.addEventListener('DOMContentLoaded', loadBookmarks);
