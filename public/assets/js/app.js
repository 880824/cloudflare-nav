/**
 * ==========================================
 * app.js - 核心前端逻辑（升级版 v4）
 * CloudNav 个人导航页主程序
 *
 * 新增：
 *  - 拖拽增强（Ghost/Chosen 动画、松手过渡）
 *  - 键盘排序（卡片内 ← → 移位按钮）
 *  - 批量多选（Ctrl+Click 或长按）+ 批量删除/移动
 *  - 内联标题编辑（管理模式下双击标题原地编辑）
 *  - 智能图标预览（输入 URL 后多源同屏展示可点击）
 *  - Emoji 推荐（根据网站名称智能推荐）
 *  - 简约模式 + 亮色模式切换
 *  - shimmer GPU 加速（translateX 代替 left）
 * ==========================================
 */

// ==================== 全局变量定义 ====================
let appData = { settings: { cardWidth: 85 }, categories: [], items: [] };
let activeCatId = '';
let sysToken = localStorage.getItem('nav_token') || '';
let isAdmin = false;
let editingType = 'items';
let editingId = null;
let toastTimer = null;
let currentViewStyle = parseInt(localStorage.getItem('nav_view_style') || '0');

// 批量选择状态
let batchMode = false;
let batchSelected = new Set(); // 存选中的 item id

// ==================== 安全与工具函数 ====================
const hashPassword = async (password) => {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// ==================== 初始化入口 ====================
document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/ServiceWorker.js')
                .catch(err => console.log('SW 注册失败:', err));
        });
    }

    document.getElementById('grid-container').addEventListener('click', (e) => {
        const card = e.target.closest('.card');
        const link = e.target.closest('a');
        if (card && link && !card.classList.contains('card-add-new') && !e.target.closest('.admin-actions')) {
            const id = card.getAttribute('data-id');
            let clicks = JSON.parse(localStorage.getItem('nav_clicks') || '{}');
            clicks[id] = (clicks[id] || 0) + 1;
            localStorage.setItem('nav_clicks', JSON.stringify(clicks));
        }
    });

    // 移动端长按卡片显示 tooltip（500ms 触发）
    setupMobileLongPress();

    initStyleSwitcher();
    initBatchToolbar();
    init();
});

// ==================== 移动端长按 Tooltip ====================
const setupMobileLongPress = () => {
    let pressTimer = null;
    document.getElementById('grid-container').addEventListener('touchstart', (e) => {
        const card = e.target.closest('.card[data-tooltip]');
        if (!card) return;
        pressTimer = setTimeout(() => {
            card.classList.add('touch-tooltip');
            setTimeout(() => card.classList.remove('touch-tooltip'), 2000);
        }, 500);
    }, { passive: true });

    document.getElementById('grid-container').addEventListener('touchend', () => {
        clearTimeout(pressTimer);
    }, { passive: true });
};

// ==================== 样式切换（含简约模式和亮色模式） ====================
const initStyleSwitcher = () => {
    document.querySelectorAll('.style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const style = parseInt(btn.getAttribute('data-style'));
            if (!isNaN(style)) {
                setViewStyle(style);
            }
        });
    });

    // 简约模式按钮
    const minimalBtn = document.getElementById('style-btn-minimal');
    if (minimalBtn) {
        const isMinimal = localStorage.getItem('nav_minimal') === '1';
        document.body.classList.toggle('minimal-mode', isMinimal);
        minimalBtn.classList.toggle('active', isMinimal);
        minimalBtn.addEventListener('click', toggleMinimalMode);
    }

    // 亮色模式按钮
    const lightBtn = document.getElementById('style-btn-light');
    if (lightBtn) {
        const isLight = localStorage.getItem('nav_light') === '1';
        document.body.classList.toggle('light-theme', isLight);
        lightBtn.classList.toggle('active', isLight);
        lightBtn.addEventListener('click', toggleLightMode);
    }

    // 检测系统暗色模式（仅首次访问时自动设置）
    if (!localStorage.getItem('nav_light_set')) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (!prefersDark) {
            // 系统为亮色时，若用户未手动设置，自动启用亮色
            // 不强制，仅作为参考（不写入以免覆盖手动设置）
        }
    }

    applyViewStyle(currentViewStyle);
};

const toggleMinimalMode = () => {
    const on = !document.body.classList.contains('minimal-mode');
    document.body.classList.toggle('minimal-mode', on);
    localStorage.setItem('nav_minimal', on ? '1' : '0');
    const btn = document.getElementById('style-btn-minimal');
    if (btn) btn.classList.toggle('active', on);
    showToast(on ? '已切换为简约模式' : '已关闭简约模式');
};

const toggleLightMode = () => {
    const on = !document.body.classList.contains('light-theme');
    document.body.classList.toggle('light-theme', on);
    localStorage.setItem('nav_light', on ? '1' : '0');
    localStorage.setItem('nav_light_set', '1');
    const btn = document.getElementById('style-btn-light');
    if (btn) btn.classList.toggle('active', on);
    showToast(on ? '已切换为亮色模式' : '已切换为暗色模式');
};

const setViewStyle = (style) => {
    if (currentViewStyle === style) return;
    currentViewStyle = style;
    localStorage.setItem('nav_view_style', style);
    applyViewStyle(style);
    renderNav();
};

const applyViewStyle = (style) => {
    document.body.classList.remove('view-style-0', 'view-style-2');
    if (style !== 0) document.body.classList.add('view-style-' + style);
    document.querySelectorAll('.style-btn[data-style]').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.getAttribute('data-style')) === style);
    });
};

// ==================== 批量操作 ====================
const initBatchToolbar = () => {
    // 插入批量工具栏 DOM
    const toolbar = document.createElement('div');
    toolbar.id = 'batch-toolbar';
    toolbar.innerHTML = `
        <span class="batch-count" id="batch-count-label">已选 0</span>
        <button class="batch-action-btn" id="batch-select-all"><i class="ri-checkbox-multiple-line"></i> 全选</button>
        <button class="batch-action-btn" id="batch-move"><i class="ri-folder-transfer-line"></i> 移动</button>
        <button class="batch-action-btn danger" id="batch-delete"><i class="ri-delete-bin-line"></i> 删除</button>
        <button class="batch-action-btn cancel-btn" id="batch-cancel">取消</button>
    `;
    document.body.appendChild(toolbar);

    document.getElementById('batch-cancel').addEventListener('click', exitBatchMode);
    document.getElementById('batch-delete').addEventListener('click', batchDelete);
    document.getElementById('batch-move').addEventListener('click', batchMove);
    document.getElementById('batch-select-all').addEventListener('click', batchSelectAll);

    // Ctrl+A 快捷键全选
    document.addEventListener('keydown', (e) => {
        if (isAdmin && batchMode && e.key === 'a' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            batchSelectAll();
        }
        if (e.key === 'Escape' && batchMode) exitBatchMode();
    });
};

const enterBatchMode = () => {
    batchMode = true;
    document.getElementById('batch-toolbar').classList.add('visible');
};

const exitBatchMode = () => {
    batchMode = false;
    batchSelected.clear();
    document.querySelectorAll('.card.batch-selected').forEach(c => c.classList.remove('batch-selected'));
    document.getElementById('batch-toolbar').classList.remove('visible');
    updateBatchCountLabel();
};

const toggleBatchSelect = (id, cardEl) => {
    if (batchSelected.has(id)) {
        batchSelected.delete(id);
        cardEl.classList.remove('batch-selected');
    } else {
        batchSelected.add(id);
        cardEl.classList.add('batch-selected');
    }
    updateBatchCountLabel();

    if (batchSelected.size === 0 && batchMode) exitBatchMode();
};

const batchSelectAll = () => {
    const activeCat = appData.categories.find(c => c.id === activeCatId);
    if (!activeCat) return;
    const catItems = appData.items.filter(i => i.catId === activeCat.id);
    catItems.forEach(item => {
        batchSelected.add(item.id);
        const el = document.querySelector(`.card[data-id="${item.id}"]`);
        if (el) el.classList.add('batch-selected');
    });
    updateBatchCountLabel();
};

const updateBatchCountLabel = () => {
    const label = document.getElementById('batch-count-label');
    if (label) label.textContent = `已选 ${batchSelected.size}`;
};

const batchDelete = () => {
    if (batchSelected.size === 0) return;
    if (!confirm(`确定删除选中的 ${batchSelected.size} 个书签？`)) return;
    batchSelected.forEach(id => {
        const idx = appData.items.findIndex(o => o.id === id);
        if (idx > -1) appData.items.splice(idx, 1);
    });
    exitBatchMode();
    renderNav();
    saveAll(false);
};

const batchMove = () => {
    if (batchSelected.size === 0) return;
    const catOptions = appData.categories.map(c =>
        `<option value="${utils.escapeHTML(c.id)}">${utils.escapeHTML(c.icon)} ${utils.escapeHTML(c.name)}</option>`
    ).join('');
    const catId = prompt(`选择目标分类 ID（可复制）:\n${appData.categories.map(c => `${c.id}: ${c.icon}${c.name}`).join('\n')}`);
    if (!catId) return;
    const targetCat = appData.categories.find(c => c.id === catId.trim());
    if (!targetCat) return showToast('未找到该分类', '#e74c3c');
    batchSelected.forEach(id => {
        const item = appData.items.find(i => i.id === id);
        if (item) item.catId = targetCat.id;
    });
    exitBatchMode();
    renderNav();
    saveAll(false);
    showToast(`已移动到 ${targetCat.icon}${targetCat.name}`);
};

// ==================== 核心函数 ====================
const updateGridWidth = () => {
    const width = (appData.settings && appData.settings.cardWidth) ? appData.settings.cardWidth : 85;
    document.documentElement.style.setProperty('--card-w', width + 'px');
};

const showLoader = (text = '正在处理中...') => {
    document.getElementById('global-loading-text').innerText = text;
    document.getElementById('global-loading-overlay').style.display = 'flex';
};

const hideLoader = () => {
    document.getElementById('global-loading-overlay').style.display = 'none';
};

const showToast = (msg = "操作成功", color = "#27ae60") => {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.style.background = color;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
};

const toggleSkeleton = (show) => {
    document.getElementById('skeleton-screen').style.display = show ? 'block' : 'none';
    document.getElementById('main-content').style.display = show ? 'none' : 'block';
};

const loadBackground = async (url) => {
    if (!url) return;
    try {
        const bgCacheName = 'nav-bg-cache-v1';
        const cache = await caches.open(bgCacheName);
        const cachedResponse = await cache.match(url);
        if (cachedResponse) {
            const blob = await cachedResponse.blob();
            document.body.style.backgroundImage = `url('${URL.createObjectURL(blob)}')`;
        }
        fetch(url, { mode: 'cors' }).then(async response => {
            if (response.ok) {
                await cache.put(url, response.clone());
                if (!cachedResponse) {
                    const blob = await response.blob();
                    document.body.style.backgroundImage = `url('${URL.createObjectURL(blob)}')`;
                }
            }
        }).catch(() => { });
    } catch (e) {
        const img = new Image();
        img.src = url;
        img.onload = () => { document.body.style.backgroundImage = `url('${url}')`; };
    }
};

const applyBackgroundConfig = () => {
    const customBg = appData.settings?.bgUrl;
    if (customBg) {
        if (customBg.startsWith('#') || customBg.startsWith('rgb')) {
            document.body.style.backgroundImage = 'none';
            document.body.style.backgroundColor = customBg;
        } else {
            loadBackground(customBg);
        }
    } else if (appData.bgUrl) {
        loadBackground(appData.bgUrl);
    }
};

const init = async (forceRender = false) => {
    const gridContainer = document.getElementById('grid-container');
    const localCache = localStorage.getItem('nav_app_data');
    let initialIsAdmin = isAdmin;

    if (localCache) {
        try {
            appData = JSON.parse(localCache);
            isAdmin = appData.isAdmin || false;
            initialIsAdmin = isAdmin;
            updateGridWidth();
            toggleSkeleton(false);
            renderTools();
            renderNav();
            applyBackgroundConfig();
            if (appData.lastUpdated) {
                document.getElementById('footer-cache').innerText = '最后同步：' + utils.escapeHTML(appData.lastUpdated);
            }
        } catch (e) {
            toggleSkeleton(true);
        }
    } else {
        toggleSkeleton(true);
    }

    try {
        const res = await fetch('/api/config', {
            headers: sysToken ? { 'Authorization': sysToken } : {},
            cache: 'no-store'
        });

        if (!res.ok) {
            if (res.status === 401) {
                localStorage.removeItem('nav_token');
                sysToken = '';
                isAdmin = false;
            }
            throw new Error(`HTTP Error ${res.status}`);
        }

        const newData = await res.json();
        const isDataChanged = !localCache ||
            JSON.stringify(appData.items) !== JSON.stringify(newData.items) ||
            JSON.stringify(appData.categories) !== JSON.stringify(newData.categories);

        appData = newData;
        isAdmin = appData.isAdmin || false;
        localStorage.setItem('nav_app_data', JSON.stringify(appData));

        updateGridWidth();
        const isAdminChanged = initialIsAdmin !== isAdmin;
        applyBackgroundConfig();

        if (forceRender || isDataChanged || isAdminChanged || !localCache) {
            toggleSkeleton(false);
            renderTools();
            renderNav();
        }

        if (appData.lastUpdated) {
            document.getElementById('footer-cache').innerText = '最后同步：' + utils.escapeHTML(appData.lastUpdated);
        }

    } catch (e) {
        console.error("后台数据更新失败", e);
        if (!localCache) {
            gridContainer.innerHTML = `<div style="margin:50px auto; padding:20px; background:rgba(255,0,0,0.2); border:1px solid red; border-radius:10px; text-align:left;">
                <h3 style="color:#ff6b6b; margin-bottom:10px;">⚠️ 数据加载失败</h3>
                <p>${utils.escapeHTML(e.message)}</p>
            </div>`;
            toggleSkeleton(false);
        }
    }
};

const renderTools = () => {
    const adminToolsContainer = document.getElementById('admin-tools');
    const catManageArea = document.getElementById('cat-manage-area');
    adminToolsContainer.innerHTML = '';

    const createFab = (text, bg, action) => {
        const btn = document.createElement('div');
        btn.className = 'fab-btn';
        btn.innerText = text;
        if (bg) {
            btn.style.background = bg;
            btn.style.color = 'white';
            btn.style.border = 'none';
        }
        btn.addEventListener('click', action);
        adminToolsContainer.appendChild(btn);
    };

    if (isAdmin) {
        document.title = "管理后台";
        catManageArea.innerHTML = `<button class="manage-cat-btn" id="btn-manage-cats"><i class="ri-settings-line"></i> 偏好设置</button>`;
        document.getElementById('btn-manage-cats').addEventListener('click', manageCats);

        createFab('登出', '#e74c3c', doLogout);
        createFab('保存', 'var(--primary)', () => saveAll(false));
        createFab('导入', null, () => document.getElementById('import-file').click());
        createFab('导出', null, exportConfig);
        createFab('默认', null, resetConfig);
        // 批量模式切换按钮
        createFab('批量', null, () => {
            if (batchMode) exitBatchMode();
            else enterBatchMode();
        });
    } else {
        document.title = "个人导航";
        catManageArea.innerHTML = '';
        createFab('管理', null, () => {
            document.getElementById('auth-overlay').style.display = 'flex';
            setTimeout(() => document.getElementById('auth-input').focus(), 100);
        });
    }
};

// ==================== 卡片 HTML 生成（多样式） ====================
const buildCardInnerHTML = (item, adminHtml, arrowsHtml, style) => {
    let fallbackAttr = `onerror="this.outerHTML='<span class=\\'emoji-icon\\'>'+window.utils.getRandomEmoji()+'</span>';"`;
    const safeIcon = utils.escapeHTML(item.icon);
    const isImgIcon = item.icon && item.icon.startsWith('http');
    const iconHtml = isImgIcon
        ? `<img src="${safeIcon}" loading="lazy" ${fallbackAttr}>`
        : `<span class="emoji-icon">${safeIcon || '🔗'}</span>`;

    const safeUrl = utils.escapeHTML(item.url);
    const safeTitle = utils.escapeHTML(item.title);

    if (style === 2) {
        return `${adminHtml}<a href="${safeUrl}" target="_blank">
            <div class="icon-wrapper">${iconHtml}</div>
            <div class="card-text-block">
                <h3 data-id="${utils.escapeHTML(item.id)}">${safeTitle}</h3>
            </div>
        </a>${arrowsHtml}`;
    } else {
        return `${adminHtml}<a href="${safeUrl}" target="_blank"><div class="icon-wrapper">${iconHtml}</div><h3 data-id="${utils.escapeHTML(item.id)}">${safeTitle}</h3></a>${arrowsHtml}`;
    }
};

/** 渲染导航内容 */
const renderNav = () => {
    const tabs = document.getElementById('tabs');
    const container = document.getElementById('grid-container');
    tabs.innerHTML = '';
    container.innerHTML = '';

    const clickData = JSON.parse(localStorage.getItem('nav_clicks') || '{}');
    const hasFrequent = Object.keys(clickData).length > 0;

    let cats = isAdmin ? [...appData.categories] : appData.categories.filter(c => !c.hidden);

    if (hasFrequent) {
        cats.unshift({ id: 'VIRTUAL_FREQ', name: '常去', icon: '⭐', hidden: false });
    }

    if (cats.length > 0 && !activeCatId) activeCatId = cats[0].id;
    if (!cats.find(c => c.id === activeCatId) && cats.length > 0) activeCatId = cats[0].id;

    cats.forEach((cat) => {
        const btn = document.createElement('button');
        btn.className = 'tab-btn' + (activeCatId === cat.id ? ' active' : '') + (cat.hidden ? ' hidden-item' : '');
        btn.innerHTML = utils.escapeHTML(cat.icon) + ' ' + utils.escapeHTML(cat.name);
        btn.addEventListener('click', () => {
            activeCatId = cat.id;
            if (batchMode) exitBatchMode();
            renderNav();
        });
        tabs.appendChild(btn);
    });

    const activeCat = cats.find(c => c.id === activeCatId);
    if (!activeCat) return;

    const grid = document.createElement('div');
    grid.id = 'grid-' + activeCat.id;
    grid.className = 'nav-grid active';

    // 统一点击分发
    grid.addEventListener('click', (e) => {
        // 批量选择模式：点击卡片选中/取消
        if (batchMode) {
            const card = e.target.closest('.card[data-id]');
            if (card && !card.classList.contains('card-add-new')) {
                e.preventDefault();
                e.stopPropagation();
                toggleBatchSelect(card.getAttribute('data-id'), card);
            }
            return;
        }

        // 管理操作按钮
        const actionBtn = e.target.closest('.action-mini');
        if (actionBtn) {
            e.preventDefault();
            e.stopPropagation();
            const action = actionBtn.getAttribute('data-action');
            const targetId = actionBtn.getAttribute('data-id');
            if (action === 'toggleHide') toggleHide('items', targetId);
            if (action === 'edit') openItemEdit(targetId, null);
            if (action === 'delete') deleteObj('items', targetId);
            return;
        }

        // 键盘排序箭头
        const arrowBtn = e.target.closest('.sort-arrow-btn');
        if (arrowBtn) {
            e.preventDefault();
            e.stopPropagation();
            const dir = arrowBtn.getAttribute('data-dir');
            const targetId = arrowBtn.getAttribute('data-id');
            shiftItem(activeCat.id, targetId, dir);
            return;
        }

        // 新增卡片
        if (e.target.closest('.card-add-new')) {
            e.preventDefault();
            e.stopPropagation();
            openItemEdit('', activeCat.id);
            return;
        }

        // Ctrl / Meta 点击进入批量模式
        if (isAdmin && (e.ctrlKey || e.metaKey)) {
            const card = e.target.closest('.card[data-id]');
            if (card && !card.classList.contains('card-add-new')) {
                e.preventDefault();
                if (!batchMode) enterBatchMode();
                toggleBatchSelect(card.getAttribute('data-id'), card);
            }
            return;
        }
    });

    // 内联双击编辑标题
    if (isAdmin) {
        grid.addEventListener('dblclick', (e) => {
            const h3 = e.target.closest('h3[data-id]');
            if (h3 && !batchMode) {
                e.preventDefault();
                e.stopPropagation();
                startInlineEdit(h3);
            }
        });
    }

    const fragment = document.createDocumentFragment();

    let catItems = [];
    if (activeCat.id === 'VIRTUAL_FREQ') {
        const allAvailableItems = appData.items.filter(i => isAdmin || !i.hidden);
        catItems = allAvailableItems
            .filter(i => clickData[i.id] > 0)
            .sort((a, b) => (clickData[b.id] || 0) - (clickData[a.id] || 0))
            .slice(0, 12);
    } else {
        catItems = appData.items.filter(i => i.catId === activeCat.id && (isAdmin || !i.hidden));
    }

    catItems.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'card' + (item.hidden ? ' hidden-item' : '') + (batchSelected.has(item.id) ? ' batch-selected' : '');
        card.setAttribute('data-id', utils.escapeHTML(item.id));

        if (currentViewStyle === 2 && item.bgColor) {
            card.style.setProperty('--card-bg-color', item.bgColor);
            card.classList.add('has-bg');
        }

        const safeDesc = utils.escapeHTML(item.desc || '');
        const safeTitle = utils.escapeHTML(item.title);
        const tooltip = safeDesc ? `${safeTitle}\n${safeDesc}` : safeTitle;
        card.setAttribute('data-tooltip', tooltip);

        let adminHtml = '';
        let arrowsHtml = '';
        if (isAdmin && activeCat.id !== 'VIRTUAL_FREQ') {
            adminHtml = `<div class="admin-actions">
                <button class="action-mini" data-action="toggleHide" data-id="${utils.escapeHTML(item.id)}"><i class="ri-eye-${item.hidden ? 'off-' : ''}line"></i></button>
                <button class="action-mini" data-action="edit" data-id="${utils.escapeHTML(item.id)}"><i class="ri-edit-line"></i></button>
                <button class="action-mini" data-action="delete" data-id="${utils.escapeHTML(item.id)}"><i class="ri-delete-bin-line"></i></button>
            </div>`;
            // 键盘排序按钮（← →）
            arrowsHtml = `<div class="sort-arrows">
                <button class="sort-arrow-btn" data-dir="left" data-id="${utils.escapeHTML(item.id)}" title="向前移">◀</button>
                <button class="sort-arrow-btn" data-dir="right" data-id="${utils.escapeHTML(item.id)}" title="向后移">▶</button>
            </div>`;
        }

        card.innerHTML = buildCardInnerHTML(item, adminHtml, arrowsHtml, currentViewStyle);
        fragment.appendChild(card);
    });

    // 新增卡片按钮
    if (isAdmin && activeCat.id !== 'VIRTUAL_FREQ') {
        const addCard = document.createElement('div');
        addCard.className = 'card card-add-new';
        addCard.style.borderStyle = 'dashed';

        if (currentViewStyle === 2) {
            addCard.innerHTML = `<a href="javascript:void(0)">
                <div class="icon-wrapper"><div class="emoji-icon">➕</div></div>
                <div class="card-text-block"><h3>新增</h3></div>
            </a>`;
        } else {
            addCard.innerHTML = '<a href="javascript:void(0)"><div class="icon-wrapper"><div class="emoji-icon">➕</div></div><h3>新增</h3></a>';
        }
        fragment.appendChild(addCard);
    }

    grid.appendChild(fragment);
    container.appendChild(grid);

    // 初始化拖拽排序（增强 chosen 样式）
    if (isAdmin && typeof Sortable !== 'undefined' && activeCat.id !== 'VIRTUAL_FREQ') {
        new Sortable(grid, {
            animation: 200,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            filter: '.card-add-new',
            onMove: (evt) => {
                if (evt.related.classList.contains('card-add-new')) return false;
            },
            onEnd: () => {
                const newIdOrder = Array.from(grid.querySelectorAll('.card[data-id]'))
                    .map(el => el.getAttribute('data-id'));
                const currentCatItems = appData.items.filter(i => i.catId === activeCat.id);
                const sortedCurrentItems = newIdOrder.map(id => currentCatItems.find(i => i.id === id)).filter(Boolean);

                let newGlobalItems = [];
                appData.categories.forEach(cat => {
                    if (cat.id === activeCat.id) {
                        newGlobalItems.push(...sortedCurrentItems);
                    } else {
                        newGlobalItems.push(...appData.items.filter(i => i.catId === cat.id));
                    }
                });
                appData.items = newGlobalItems;
                saveAll(true);
            }
        });
    }
};

// ==================== 键盘排序：左右移位 ====================
const shiftItem = (catId, itemId, dir) => {
    const catItems = appData.items.filter(i => i.catId === catId);
    const idx = catItems.findIndex(i => i.id === itemId);
    if (idx === -1) return;

    if (dir === 'left' && idx > 0) {
        [catItems[idx - 1], catItems[idx]] = [catItems[idx], catItems[idx - 1]];
    } else if (dir === 'right' && idx < catItems.length - 1) {
        [catItems[idx], catItems[idx + 1]] = [catItems[idx + 1], catItems[idx]];
    } else {
        return; // 已在边界，无需处理
    }

    // 写回 appData.items（保持其他分类顺序不变）
    let newGlobalItems = [];
    appData.categories.forEach(cat => {
        if (cat.id === catId) {
            newGlobalItems.push(...catItems);
        } else {
            newGlobalItems.push(...appData.items.filter(i => i.catId === cat.id));
        }
    });
    appData.items = newGlobalItems;
    renderNav();
    saveAll(true);
};

// ==================== 内联标题编辑 ====================
const startInlineEdit = (h3El) => {
    const id = h3El.getAttribute('data-id');
    const item = appData.items.find(i => i.id === id);
    if (!item) return;

    h3El.contentEditable = 'true';
    h3El.classList.add('inline-editing');
    h3El.focus();

    // 将光标移至末尾
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(h3El);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    const commit = () => {
        h3El.contentEditable = 'false';
        h3El.classList.remove('inline-editing');
        const newTitle = h3El.textContent.trim();
        if (newTitle && newTitle !== item.title) {
            item.title = newTitle;
            // 更新 tooltip
            const card = h3El.closest('.card');
            if (card) {
                const safeDesc = utils.escapeHTML(item.desc || '');
                const safeTitle = utils.escapeHTML(item.title);
                card.setAttribute('data-tooltip', safeDesc ? `${safeTitle}\n${safeDesc}` : safeTitle);
            }
            saveAll(true);
            showToast('标题已更新');
        } else {
            h3El.textContent = utils.escapeHTML(item.title);
        }
    };

    h3El.addEventListener('blur', commit, { once: true });
    h3El.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); h3El.blur(); }
        if (e.key === 'Escape') {
            h3El.textContent = utils.escapeHTML(item.title);
            h3El.blur();
        }
    });
};

// ==================== 编辑相关函数 ====================
const debouncedHandleUrlInput = utils.debounce((val) => handleUrlInput(val), 500);

const openItemEdit = (id, catId) => {
    editingType = 'items';
    editingId = id;

    const item = id
        ? appData.items.find(i => i.id === id)
        : { id: 'i' + Date.now(), title: '', url: '', desc: '', icon: '', catId: catId };

    const safeUrl = utils.escapeHTML(item.url);
    const safeTitle = utils.escapeHTML(item.title);
    const safeIcon = utils.escapeHTML(item.icon);
    const safeDesc = utils.escapeHTML(item.desc || '');
    const safeBgColor = utils.escapeHTML(item.bgColor || '');

    document.getElementById('edit-title').innerText = id ? '编辑网站' : '新增网站';
    document.getElementById('edit-form-body').innerHTML = `
        <div class="form-row"><label>网站 URL</label><input id="f-url" value="${safeUrl}" placeholder="https://example.com"></div>
        <div class="form-row"><label>网站名称</label><input id="f-title" value="${safeTitle}"></div>
        <div class="form-row"><label>网站说明</label><input id="f-desc" value="${safeDesc}" placeholder="选填，鼠标悬停时显示"></div>
        <div class="form-row"><label>当前图标</label>
            <div style="display:flex; width:100%; align-items:center;">
                <input id="f-icon" value="${safeIcon}" placeholder="可手动填入，或选择下方智能图标">
                <div id="preview-box" class="preview-container"></div>
            </div>
        </div>
        <!-- 智能图标预览区：输入 URL 后多源同屏展示 -->
        <div class="form-row" style="flex-direction: column; align-items:flex-start; gap: 6px;">
            <label style="font-size:12px; color:#999; font-weight:normal;">智能图标预览</label>
            <div id="smart-icon-preview" style="min-height:48px;"></div>
        </div>
        <div class="form-row"><label style="font-size:12px; font-weight:normal; color:#999;">图标搜索</label>
            <div style="display:flex; flex-direction:column; width:100%; gap:5px;">
                <div style="display:flex; gap:5px;">
                    <input id="iconify-search" placeholder="输入英文关键词, 如 github" style="flex:1;">
                    <button type="button" class="manage-cat-btn" id="btn-iconify-search" style="border: 1px solid var(--primary); color: white; background: var(--primary);">搜索</button>
                </div>
                <div id="iconify-results" style="display:flex; flex-wrap:wrap; gap:5px; max-height:80px; overflow-y:auto; margin-top:5px;"></div>
            </div>
        </div>
        <!-- Emoji 推荐区 -->
        <div class="form-row" style="flex-direction:column; align-items:flex-start; gap:6px;">
            <label style="font-size:12px; color:#999; font-weight:normal;">Emoji 推荐</label>
            <div id="emoji-recommendations"></div>
        </div>
        <div class="form-row" style="border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 15px; margin-bottom: 15px;">
            <label style="font-size:12px;">网格背景色</label>
            <div style="display:flex; align-items:center; gap:8px; width:100%;">
                <input type="color" id="f-bg-color" value="${safeBgColor || '#399dff'}" style="width:40px; height:36px; padding:2px; border:none; border-radius:6px; cursor:pointer; background:transparent; flex-shrink:0;">
                <input id="f-bg-color-text" value="${safeBgColor}" placeholder="如 rgba(57,157,255,0.45) 或 #3b82f6，留空使用默认" style="flex:1;">
            </div>
        </div>
        <div class="form-row"><label>归属分类</label>
            <select id="f-cat">${appData.categories.map(c => `<option value="${utils.escapeHTML(c.id)}" ${c.id === item.catId ? 'selected' : ''}>${utils.escapeHTML(c.name)}</option>`).join('')}</select>
        </div>
    `;

    // 背景色联动
    const colorInput = document.getElementById('f-bg-color');
    const colorText = document.getElementById('f-bg-color-text');
    colorInput.addEventListener('input', () => { colorText.value = colorInput.value; });
    colorText.addEventListener('input', () => {
        if (/^#[0-9a-fA-F]{6}$/.test(colorText.value)) colorInput.value = colorText.value;
    });

    // URL 输入触发智能图标预览
    document.getElementById('f-url').addEventListener('input', (e) => {
        debouncedHandleUrlInput(e.target.value);
    });
    document.getElementById('f-icon').addEventListener('input', (e) => updatePreview(e.target.value));

    // 名称输入触发 Emoji 推荐
    document.getElementById('f-title').addEventListener('input', (e) => {
        updateEmojiRecommendations(e.target.value);
    });

    // Iconify 搜索
    document.getElementById('btn-iconify-search').addEventListener('click', async () => {
        const query = document.getElementById('iconify-search').value.trim();
        if (!query) return;
        const resBox = document.getElementById('iconify-results');
        resBox.innerHTML = '<span style="font-size:12px;">搜索中...</span>';
        try {
            const req = await fetch(`https://api.iconify.design/search?query=${query}&limit=12`);
            const data = await req.json();
            resBox.innerHTML = '';
            if (data.icons && data.icons.length > 0) {
                data.icons.forEach(iconName => {
                    const imgUrl = `https://api.iconify.design/${iconName}.svg`;
                    const img = document.createElement('img');
                    img.src = imgUrl;
                    img.style.cssText = 'width:30px; height:30px; cursor:pointer; background:rgba(255,255,255,0.1); border-radius:6px; padding:4px; transition: 0.2s;';
                    img.onmouseover = () => img.style.background = 'rgba(255,255,255,0.3)';
                    img.onmouseout = () => img.style.background = 'rgba(255,255,255,0.1)';
                    img.onclick = () => selectIcon(imgUrl);
                    resBox.appendChild(img);
                });
            } else {
                resBox.innerHTML = '<span style="font-size:12px; color:#aaa;">未找到结果</span>';
            }
        } catch (e) {
            resBox.innerHTML = '<span style="font-size:12px; color:#e74c3c;">网络或接口错误</span>';
        }
    });

    updatePreview(item.icon);
    updateEmojiRecommendations(item.title);
    if (item.url) handleUrlInput(item.url, false);
    document.getElementById('edit-modal').style.display = 'flex';
};

// ==================== 智能图标预览（多源同屏） ====================

/**
 * 根据 URL 同时展示多个图标来源，用户点击即选中
 */
const handleUrlInput = (url, autoSelect = true) => {
    const previewContainer = document.getElementById('smart-icon-preview');
    if (!previewContainer) return;

    if (url && url.startsWith('http')) {
        try {
            const domain = new URL(url).hostname;
            const sources = [
                { id: 'fav1', label: 'Favicon.im', url: `https://favicon.im/${domain}` },
                { id: 'fav2', label: 'DuckDuckGo', url: `https://icons.duckduckgo.com/ip3/${domain}.ico` },
            ];

            previewContainer.innerHTML = sources.map(s => `
                <div class="icon-source-card" data-icon-url="${utils.escapeHTML(s.url)}" id="icon-src-${s.id}">
                    <img src="${utils.escapeHTML(s.url)}" loading="lazy"
                         onerror="this.parentNode.style.opacity='0.35'"
                         style="width:28px;height:28px;object-fit:contain;">
                    <span>${utils.escapeHTML(s.label)}</span>
                </div>
            `).join('');

            // 点击选中
            previewContainer.querySelectorAll('.icon-source-card').forEach(card => {
                card.addEventListener('click', () => {
                    previewContainer.querySelectorAll('.icon-source-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    selectIcon(card.getAttribute('data-icon-url'));
                });
            });

            // 自动选中第一个（仅当 icon 字段为空时）
            const currentIconVal = document.getElementById('f-icon')?.value;
            if (autoSelect && !currentIconVal) {
                const firstCard = previewContainer.querySelector('.icon-source-card');
                if (firstCard) {
                    firstCard.classList.add('selected');
                    selectIcon(firstCard.getAttribute('data-icon-url'));
                }
            } else if (currentIconVal) {
                previewContainer.querySelectorAll('.icon-source-card').forEach(card => {
                    if (card.getAttribute('data-icon-url') === currentIconVal) {
                        card.classList.add('selected');
                    }
                });
            }
        } catch (e) {
            previewContainer.innerHTML = '<span style="font-size:12px; color:#aaa;">请输入有效 URL</span>';
        }
    } else {
        previewContainer.innerHTML = '<span style="font-size:12px; color:#aaa;">输入网址后自动展示可选图标</span>';
    }
};

// ==================== Emoji 智能推荐 ====================

/** 关键词 → Emoji 映射表 */
const EMOJI_KEYWORD_MAP = [
    { keywords: ['github', 'git'], emojis: ['🐙', '🐈', '⚡', '🔧'] },
    { keywords: ['youtube', 'video', '视频', '影片'], emojis: ['▶️', '🎬', '📹', '🎥'] },
    { keywords: ['twitter', 'x', '推特'], emojis: ['🐦', '💬', '📢'] },
    { keywords: ['google', '搜索', 'search'], emojis: ['🔍', '🌐', '🔎'] },
    { keywords: ['facebook', 'fb', '脸书'], emojis: ['👥', '💬', '🌐'] },
    { keywords: ['music', '音乐', 'spotify', 'netease', '网易'], emojis: ['🎵', '🎶', '🎸', '🎹'] },
    { keywords: ['mail', 'email', '邮件', 'gmail', 'outlook'], emojis: ['📧', '✉️', '📬'] },
    { keywords: ['cloud', '云', 'drive', '网盘'], emojis: ['☁️', '💾', '📂'] },
    { keywords: ['shop', '购物', 'taobao', '淘宝', 'jd', '京东', 'amazon'], emojis: ['🛒', '🛍️', '💳'] },
    { keywords: ['news', '新闻', '资讯'], emojis: ['📰', '📄', '🗞️'] },
    { keywords: ['photo', '图片', 'picture', '相册', 'instagram'], emojis: ['📷', '🖼️', '📸'] },
    { keywords: ['ai', '智能', 'gpt', 'chatgpt', 'llm'], emojis: ['🤖', '🧠', '✨', '💡'] },
    { keywords: ['code', '代码', 'dev', '开发', 'stack', 'overflow'], emojis: ['💻', '⌨️', '🖥️', '🔧'] },
    { keywords: ['game', '游戏', 'steam'], emojis: ['🎮', '🕹️', '🎲'] },
    { keywords: ['document', '文档', 'wiki', 'notion', '笔记'], emojis: ['📝', '📋', '🗒️'] },
    { keywords: ['map', '地图', 'location', '导航'], emojis: ['🗺️', '📍', '🧭'] },
    { keywords: ['finance', '金融', '股票', '基金', 'money', '理财'], emojis: ['💹', '💰', '📈', '💵'] },
    { keywords: ['tool', '工具', 'utils', 'helper'], emojis: ['🔧', '🛠️', '⚙️'] },
    { keywords: ['book', '书', 'read', '阅读'], emojis: ['📚', '📖', '🗎'] },
    { keywords: ['social', '社交', 'community', '社区'], emojis: ['👋', '🤝', '💬'] },
];

const updateEmojiRecommendations = (title) => {
    const container = document.getElementById('emoji-recommendations');
    if (!container) return;
    if (!title || !title.trim()) {
        container.innerHTML = '<span style="font-size:12px;color:#666;">输入名称后自动推荐 Emoji</span>';
        return;
    }
    const lowerTitle = title.toLowerCase();
    let matched = [];
    for (const entry of EMOJI_KEYWORD_MAP) {
        if (entry.keywords.some(k => lowerTitle.includes(k))) {
            matched.push(...entry.emojis);
            if (matched.length >= 8) break;
        }
    }
    // 若无关键词匹配，随机推荐几个
    if (matched.length === 0 && window.emojiPool) {
        matched = window.emojiPool.getRandomEmojis(6);
    }

    container.innerHTML = matched.slice(0, 8).map(em =>
        `<button type="button" class="emoji-rec-btn" data-emoji="${em}">${em}</button>`
    ).join('');

    container.querySelectorAll('.emoji-rec-btn').forEach(btn => {
        btn.addEventListener('click', () => selectIcon(btn.getAttribute('data-emoji')));
    });
};

const selectIcon = (url) => {
    if (!url) return;
    document.getElementById('f-icon').value = url;
    updatePreview(url);
};

const updatePreview = (val) => {
    const box = document.getElementById('preview-box');
    if (!val) { box.innerHTML = '🔗'; return; }
    const safeVal = utils.escapeHTML(val);
    if (safeVal.startsWith('http')) {
        let fallbackAttr = `onerror="this.outerHTML='<span class=\\'emoji-icon\\'>'+window.utils.getRandomEmoji()+'</span>';"`;
        box.innerHTML = `<img src="${safeVal}" loading="lazy" ${fallbackAttr}>`;
    } else {
        box.innerHTML = `<span class="emoji-icon">${safeVal}</span>`;
    }
};

// ==================== 偏好设置（含分类管理、简约/亮色开关） ====================
const manageCats = () => {
    editingType = 'cats';
    document.getElementById('edit-title').innerText = '偏好与分类设置';

    const currentWidth = (appData.settings && appData.settings.cardWidth) ? appData.settings.cardWidth : 85;
    const currentBg = (appData.settings && appData.settings.bgUrl) ? appData.settings.bgUrl : '';
    const bgIsColor = /^#[0-9a-fA-F]{6}$/.test(currentBg);
    const isMinimal = document.body.classList.contains('minimal-mode');
    const isLight = document.body.classList.contains('light-theme');

    document.getElementById('edit-form-body').innerHTML = `
        <div class="form-row" style="margin-bottom: 10px;">
            <label>网格宽度</label><input type="number" id="setting-width" value="${currentWidth}"><span style="color:#666; margin-left:10px;">px</span>
        </div>
        <div class="form-row" style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 10px;">
            <label>自定义背景</label>
            <div style="display:flex; align-items:center; gap:8px; flex:1;">
                <input type="color" id="setting-bg-color" value="${bgIsColor ? currentBg : '#222222'}" style="width:40px; height:36px; padding:2px; border:none; border-radius:6px; cursor:pointer; background:transparent; flex-shrink:0;">
                <input type="text" id="setting-bg" value="${utils.escapeHTML(currentBg)}" placeholder="填URL或纯色(如#222), 留空使用Bing" style="flex:1;">
            </div>
        </div>
        <!-- 外观模式切换 -->
        <div class="form-row" style="margin-bottom: 6px;">
            <label style="font-size:12px; color:#999;">简约模式</label>
            <div style="display:flex; align-items:center; gap:8px;">
                <label style="position:relative; display:inline-block; width:42px; height:22px; flex-shrink:0;">
                    <input type="checkbox" id="toggle-minimal" ${isMinimal ? 'checked' : ''} style="opacity:0; width:0; height:0; position:absolute;">
                    <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:${isMinimal ? 'var(--primary)' : 'rgba(255,255,255,0.15)'}; transition:.3s; border-radius:22px;" id="toggle-minimal-bg"></span>
                    <span style="position:absolute; height:16px; width:16px; left:${isMinimal ? '22px' : '3px'}; bottom:3px; background-color:white; transition:.3s; border-radius:50%;" id="toggle-minimal-knob"></span>
                </label>
                <span style="font-size:12px; color:#aaa;">关闭毛玻璃模糊，提升低端设备流畅度</span>
            </div>
        </div>
        <div class="form-row" style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 15px;">
            <label style="font-size:12px; color:#999;">亮色模式</label>
            <div style="display:flex; align-items:center; gap:8px;">
                <label style="position:relative; display:inline-block; width:42px; height:22px; flex-shrink:0;">
                    <input type="checkbox" id="toggle-light" ${isLight ? 'checked' : ''} style="opacity:0; width:0; height:0; position:absolute;">
                    <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:${isLight ? 'var(--primary)' : 'rgba(255,255,255,0.15)'}; transition:.3s; border-radius:22px;" id="toggle-light-bg"></span>
                    <span style="position:absolute; height:16px; width:16px; left:${isLight ? '22px' : '3px'}; bottom:3px; background-color:white; transition:.3s; border-radius:50%;" id="toggle-light-knob"></span>
                </label>
                <span style="font-size:12px; color:#aaa;">白天户外使用更易阅读</span>
            </div>
        </div>
        <!-- 分类排序列表 -->
        <div id="cat-list-sort" style="max-height: 260px; overflow-y: auto;">
            ${appData.categories.map((c) => `
                <div class="cat-item-row" data-id="${utils.escapeHTML(c.id)}" style="display:flex; gap:8px; margin-bottom:10px; align-items:center; background:rgba(255,255,255,0.05); padding:8px; border-radius:10px;">
                    <i class="ri-drag-move-fill drag-handle"></i>
                    <input class="cat-icon-input" data-id="${utils.escapeHTML(c.id)}" value="${utils.escapeHTML(c.icon)}" style="width:40px; text-align:center; padding:5px">
                    <input class="cat-name-input" data-id="${utils.escapeHTML(c.id)}" value="${utils.escapeHTML(c.name)}" style="flex:1; padding:5px">
                    <button class="action-mini btn-cat-hide" data-id="${utils.escapeHTML(c.id)}"><i class="ri-eye-${c.hidden ? 'off-' : ''}line"></i></button>
                    <button class="action-mini btn-cat-del" data-id="${utils.escapeHTML(c.id)}"><i class="ri-delete-bin-line"></i></button>
                </div>
            `).join('')}
        </div>
        <button class="tab-btn active" id="btn-add-cat" style="width:100%; margin-top:15px">+ 新增分类</button>
    `;

    // 各表单联动
    document.getElementById('setting-width').addEventListener('input', (e) => changeCardWidth(e.target.value));

    const bgColorPicker = document.getElementById('setting-bg-color');
    const bgTextInput = document.getElementById('setting-bg');
    bgColorPicker.addEventListener('input', () => {
        bgTextInput.value = bgColorPicker.value;
        if (!appData.settings) appData.settings = {};
        appData.settings.bgUrl = bgColorPicker.value;
        applyBackgroundConfig();
    });
    bgTextInput.addEventListener('input', () => {
        const val = bgTextInput.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(val)) bgColorPicker.value = val;
        if (!appData.settings) appData.settings = {};
        appData.settings.bgUrl = val;
        applyBackgroundConfig();
    });

    // 简约模式开关
    document.getElementById('toggle-minimal').addEventListener('change', (e) => {
        const on = e.target.checked;
        document.body.classList.toggle('minimal-mode', on);
        localStorage.setItem('nav_minimal', on ? '1' : '0');
        document.getElementById('toggle-minimal-bg').style.background = on ? 'var(--primary)' : 'rgba(255,255,255,0.15)';
        document.getElementById('toggle-minimal-knob').style.left = on ? '22px' : '3px';
    });

    // 亮色模式开关
    document.getElementById('toggle-light').addEventListener('change', (e) => {
        const on = e.target.checked;
        document.body.classList.toggle('light-theme', on);
        localStorage.setItem('nav_light', on ? '1' : '0');
        localStorage.setItem('nav_light_set', '1');
        document.getElementById('toggle-light-bg').style.background = on ? 'var(--primary)' : 'rgba(255,255,255,0.15)';
        document.getElementById('toggle-light-knob').style.left = on ? '22px' : '3px';
    });

    document.getElementById('btn-add-cat').addEventListener('click', addCat);

    const catListSort = document.getElementById('cat-list-sort');
    catListSort.addEventListener('change', (e) => {
        if (e.target.classList.contains('cat-icon-input')) {
            updateCatData(e.target.getAttribute('data-id'), 'icon', e.target.value);
        } else if (e.target.classList.contains('cat-name-input')) {
            updateCatData(e.target.getAttribute('data-id'), 'name', e.target.value);
        }
    });
    catListSort.addEventListener('click', (e) => {
        const hideBtn = e.target.closest('.btn-cat-hide');
        if (hideBtn) { e.preventDefault(); toggleHide('categories', hideBtn.getAttribute('data-id')); }
        const delBtn = e.target.closest('.btn-cat-del');
        if (delBtn) { e.preventDefault(); deleteObj('categories', delBtn.getAttribute('data-id')); }
    });

    new Sortable(catListSort, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onEnd: () => {
            const newIdOrder = Array.from(catListSort.querySelectorAll('.cat-item-row'))
                .map(el => el.getAttribute('data-id'));
            appData.categories = newIdOrder.map(id => appData.categories.find(c => c.id === id)).filter(Boolean);
            let newGlobalItems = [];
            appData.categories.forEach(cat => {
                newGlobalItems.push(...appData.items.filter(i => i.catId === cat.id));
            });
            appData.items = newGlobalItems;
            renderNav();
            saveAll(true);
        }
    });

    document.getElementById('edit-modal').style.display = 'flex';
};

const changeCardWidth = (val) => {
    if (!appData.settings) appData.settings = {};
    appData.settings.cardWidth = parseInt(val) || 85;
    updateGridWidth();
};

const updateCatData = (id, field, val) => {
    const cat = appData.categories.find(c => c.id === id);
    if (cat) cat[field] = val;
    renderNav();
};

const addCat = () => {
    const usedLetters = appData.categories.map(c => c.id.charAt(0).toUpperCase());
    let nextLetter = 'A';
    if (usedLetters.length > 0) {
        const maxCharCode = Math.max(...usedLetters.map(l => l.charCodeAt(0)));
        nextLetter = String.fromCharCode(maxCharCode + 1);
    }
    if (nextLetter > 'Z') nextLetter = 'Z' + Date.now().toString().slice(-2);
    appData.categories.push({ id: `${nextLetter}01`, name: '新分类', icon: '📁', hidden: false });
    manageCats();
    renderNav();
};

const confirmEdit = () => {
    if (editingType === 'items') {
        const url = document.getElementById('f-url').value;
        const title = document.getElementById('f-title').value;
        const desc = document.getElementById('f-desc').value;
        const icon = document.getElementById('f-icon').value;
        const bgColor = document.getElementById('f-bg-color-text').value.trim();
        const catId = document.getElementById('f-cat').value;

        if (editingId) {
            const idx = appData.items.findIndex(i => i.id === editingId);
            if (idx > -1) {
                appData.items[idx] = { ...appData.items[idx], url, title, desc, icon, bgColor, catId };
            }
        } else {
            const catLetter = catId.charAt(0).toUpperCase();
            const siblingItems = appData.items.filter(i => i.catId === catId);
            let nextNum = 1;
            if (siblingItems.length > 0) {
                const ids = siblingItems.map(i => parseInt(i.id.slice(1)) || 0);
                nextNum = Math.max(...ids) + 1;
            }
            const newId = `${catLetter}${String(nextNum).padStart(3, '0')}`;
            appData.items.push({ id: newId, url, title, desc, icon, bgColor, catId, hidden: false });
        }
    }
    renderNav();
    closeModal();
    saveAll(false);
};

const toggleHide = (type, id) => {
    const item = appData[type].find(o => o.id === id);
    if (item) item.hidden = !item.hidden;
    saveAll(false);
    renderNav();
    if (type === 'categories') manageCats();
};

const deleteObj = (type, id) => {
    if (confirm('确定删除？')) {
        const idx = appData[type].findIndex(o => o.id === id);
        if (idx > -1) appData[type].splice(idx, 1);
        renderNav();
        if (type === 'categories') manageCats();
        saveAll(false);
    }
};

// ==================== 认证相关 ====================
const doLogin = async () => {
    showLoader('正在验证管理员身份...');
    const rawPwd = document.getElementById('auth-input').value.trim();
    if (!rawPwd) { hideLoader(); return showToast("请输入密码", "#e67e22"); }

    sysToken = await hashPassword(rawPwd);
    localStorage.setItem('nav_token', sysToken);
    document.getElementById('auth-overlay').style.display = 'none';

    await init(true);
    hideLoader();
    if (!isAdmin) {
        showToast("验证失败，密码不正确", "#e74c3c");
        localStorage.removeItem('nav_token');
        sysToken = '';
    } else {
        showToast("已进入管理模式");
        document.getElementById('auth-input').value = '';
    }
};

const doLogout = async () => {
    showLoader('正在退出管理模式...');
    await new Promise(r => setTimeout(r, 600));
    localStorage.removeItem('nav_token');
    sysToken = '';
    isAdmin = false;
    appData.isAdmin = false;
    localStorage.setItem('nav_app_data', JSON.stringify(appData));
    exitBatchMode();
    hideLoader();
    showToast("已退出管理模式", "#399dff");
    init(true);
};

// ==================== 数据操作 ====================
const saveAll = async (silent = false) => {
    if (!silent) showLoader('正在同步配置中...');
    const dataToSave = { ...appData };
    delete dataToSave.isAdmin;
    delete dataToSave.bgUrl;
    localStorage.setItem('nav_app_data', JSON.stringify(appData));

    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Authorization': sysToken, 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSave)
        });
        if (!silent) hideLoader();
        if (res.ok && !silent) { showToast("保存成功！"); }
        else if (!res.ok && !silent) { showToast("保存失败，权限不足", "#e74c3c"); }
    } catch (error) {
        if (!silent) { hideLoader(); showToast("网络错误，配置仅保存在本地", "#e67e22"); }
    }
};

const importConfig = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.categories && imported.items) {
                appData = imported;
                renderTools();
                renderNav();
                await saveAll(false);
                showToast("配置导入成功！");
            } else {
                showToast("无效的配置文件格式", "#e74c3c");
            }
        } catch (err) {
            showToast("文件解析失败", "#e74c3c");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
};

const exportConfig = () => {
    let sortedItems = [];
    appData.categories.forEach(cat => {
        const catItems = appData.items.filter(i => i.catId === cat.id);
        sortedItems.push(...catItems);
    });
    const dataToExport = { settings: appData.settings, categories: appData.categories, items: sortedItems };
    let jsonStr = JSON.stringify(dataToExport, null, 2);
    jsonStr = jsonStr.replace(/\{[\s\S]*?\}/g, (match) => match.replace(/\n\s+/g, ' '));
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `nav-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("配置已按紧凑格式导出");
};

const resetConfig = async () => {
    if (!confirm('确定恢复默认配置？此操作不可撤销。')) return;
    showLoader('正在重置...');
    try {
        const res = await fetch('/api/config', {
            method: 'DELETE',
            headers: { 'Authorization': sysToken }
        });
        hideLoader();
        if (res.ok) {
            localStorage.removeItem('nav_app_data');
            showToast("已重置为默认配置");
            init(true);
        } else {
            showToast("重置失败，权限不足", "#e74c3c");
        }
    } catch (e) {
        hideLoader();
        showToast("网络错误", "#e74c3c");
    }
};

const closeModal = () => {
    document.getElementById('edit-modal').style.display = 'none';
};

// ==================== 事件绑定 ====================
document.getElementById('btn-login').addEventListener('click', doLogin);
document.getElementById('auth-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
});
document.getElementById('btn-close-auth').addEventListener('click', () => {
    document.getElementById('auth-overlay').style.display = 'none';
});
document.getElementById('btn-confirm-edit').addEventListener('click', confirmEdit);
document.getElementById('btn-close-edit').addEventListener('click', closeModal);
document.getElementById('import-file').addEventListener('change', importConfig);
