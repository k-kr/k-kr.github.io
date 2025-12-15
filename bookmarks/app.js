let bookmarksData = null;
let currentCategory = null;

async function loadBookmarks() {
    try {
        const response = await fetch('bookmarks.json');
        bookmarksData = await response.json();
        renderSidebar();
        setupEventListeners();
    } catch (error) {
        console.error('Error loading bookmarks:', error);
    }
}

function renderSidebar() {
    const nav = document.getElementById('category-nav');
    nav.innerHTML = bookmarksData.categories.map(category => `
        <button class="nav-item" data-category="${category.id}">
            <span class="material-icons">${category.icon}</span>
            <span class="nav-label">${category.name}</span>
            <span class="nav-count">${countLinks(category)}</span>
        </button>
    `).join('');
}

function countLinks(category) {
    return category.sections.reduce((total, section) => total + section.links.length, 0);
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

function renderCategory(categoryId) {
    const category = bookmarksData.categories.find(c => c.id === categoryId);
    if (!category) return;

    currentCategory = categoryId;

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.category === categoryId);
    });

    const content = document.getElementById('category-content');
    const welcome = document.getElementById('welcome-screen');
    const searchResults = document.getElementById('search-results');

    welcome.classList.add('hidden');
    searchResults.classList.add('hidden');
    content.classList.remove('hidden');

    content.innerHTML = `
        <div class="category-header">
            <div class="category-badge" aria-hidden="true">
                <span class="material-icons">${category.icon}</span>
            </div>
            <h2>${category.name}</h2>
        </div>
        <div class="sections">
            ${category.sections.map(section => `
                <div class="section">
                    <h3 class="section-title">${section.name}</h3>
                    <div class="links-grid">
                        ${section.links.map(link => {
        const host = new URL(link.url).hostname;
        return `
                                <a href="${link.url}" class="link-card" target="_blank" rel="noopener noreferrer">
                                    <div class="link-favicon" aria-hidden="true">
                                        <img data-favicon src="https://www.google.com/s2/favicons?domain=${host}&sz=32" alt="" loading="lazy">
                                    </div>
                                    <div class="link-info">
                                        <span class="link-title">${link.title}</span>
                                        <span class="link-url">${host}</span>
                                    </div>
                                    <span class="link-action" aria-hidden="true">
                                        <span class="material-icons">open_in_new</span>
                                    </span>
                                </a>
                            `;
    }).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    wireFaviconFallback(content);
}

function performSearch(query) {
    if (!query.trim()) {
        showWelcome();
        return;
    }

    const searchResults = document.getElementById('search-results');
    const welcome = document.getElementById('welcome-screen');
    const categoryContent = document.getElementById('category-content');

    welcome.classList.add('hidden');
    categoryContent.classList.add('hidden');
    searchResults.classList.remove('hidden');

    const queryLower = query.toLowerCase();
    const results = [];

    bookmarksData.categories.forEach(category => {
        category.sections.forEach(section => {
            section.links.forEach(link => {
                if (link.title.toLowerCase().includes(queryLower) ||
                    link.url.toLowerCase().includes(queryLower)) {
                    results.push({
                        ...link,
                        category: category.name,
                        section: section.name
                    });
                }
            });
        });
    });

    if (results.length === 0) {
        searchResults.innerHTML = `
            <div class="no-results">
                <span class="material-icons">search_off</span>
                <h3>No results found</h3>
                <p>Try a different search term</p>
            </div>
        `;
        return;
    }

    searchResults.innerHTML = `
        <div class="search-header">
            <h2>Search Results</h2>
            <span class="result-count">${results.length} bookmark${results.length !== 1 ? 's' : ''} found</span>
        </div>
        <div class="links-grid">
            ${results.map(link => {
        const host = new URL(link.url).hostname;
        return `
                    <a href="${link.url}" class="link-card" target="_blank" rel="noopener noreferrer">
                        <div class="link-favicon" aria-hidden="true">
                            <img data-favicon src="https://www.google.com/s2/favicons?domain=${host}&sz=32" alt="" loading="lazy">
                        </div>
                        <div class="link-info">
                            <span class="link-title">${highlightMatch(link.title, query)}</span>
                            <span class="link-url">${host}</span>
                            <span class="link-breadcrumb">${link.category} / ${link.section}</span>
                        </div>
                        <span class="link-action" aria-hidden="true">
                            <span class="material-icons">open_in_new</span>
                        </span>
                    </a>
                `;
    }).join('')}
        </div>
    `;

    wireFaviconFallback(searchResults);

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
}

function highlightMatch(text, query) {
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showWelcome() {
    const welcome = document.getElementById('welcome-screen');
    const categoryContent = document.getElementById('category-content');
    const searchResults = document.getElementById('search-results');

    welcome.classList.remove('hidden');
    categoryContent.classList.add('hidden');
    searchResults.classList.add('hidden');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    currentCategory = null;
}

function isEditableTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function isPrintableKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key.length !== 1) return false;     // filters Tab/Arrow/Escape/etc
    if (e.key === ' ') return false;          // keep Space scrolling; remove if you want space-to-search
    return true;
}

function setupEventListeners() {
    document.getElementById('category-nav').addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem) {
            document.getElementById('search-input').value = '';
            renderCategory(navItem.dataset.category);
        }
    });

    const searchInput = document.getElementById('search-input');
    let debounceTimer;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performSearch(e.target.value);
        }, 150);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            if (currentCategory) renderCategory(currentCategory);
            else showWelcome();
            searchInput.blur();
            return;
        }

        if (isEditableTarget(e.target) || document.activeElement === searchInput) return;

        if (e.key === '/' && document.activeElement !== searchInput) {
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