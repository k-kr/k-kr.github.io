let bookmarks = [];
let selectedTags = new Set();
let searchQuery = '';
let selectedCategory = null;  // null = "All"
let selectedSection = null;

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

function renderBookmarkCard(link) {
    const host = new URL(link.url).hostname;
    const title = searchQuery ? highlightMatch(link.title, searchQuery) : link.title;
    const desc = link.description || '';
    return `
        <a href="${link.url}" class="link-card" target="_blank" rel="noopener noreferrer">
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
                icon.textContent = 'link';
            }, 1500);
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const hasAnyFilter = selectedTags.size > 0 || selectedCategory || searchQuery.trim();
            if (hasAnyFilter) {
                clearFilters();
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
