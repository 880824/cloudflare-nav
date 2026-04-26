/**
 * ==========================================
 * app.js - 核心前端逻辑（升级版 v4）
 * CloudNav 个人导航页主程序
 * 支持：默认样式（Style 0）与缤纷模式（Style 2）
 * 增强：批量操作、主题切换、内联编辑、Emoji智能推荐
 * ==========================================
 */

// ==================== 全局变量定义 ====================
/** @type {Object} 应用数据对象 */
let appData = { settings: { cardWidth: 85 }, categories: [], items: [] };

/** @type {string} 当前激活的分类ID */
let activeCatId = '';

/** @type {string} 系统Token（管理员凭证） */
let sysToken = localStorage.getItem('nav_token') || '';

/** @type {boolean} 是否为管理员模式 */
let isAdmin = false;

/** @type {string} 当前编辑类型（items/categories） */
let editingType = 'items';

/** @type {string|null} 当前编辑的ID */
let editingId = null;

/** @type {number} Toast定时器 */
let toastTimer = null;

/**
 * 当前展示样式
 * 0 = 默认图标网格（原版）
 * 2 = 缤纷模式（列表详情 + 用户自定义网格背景色）
 */
let currentViewStyle = parseInt(localStorage.getItem('nav_view_style') || '0');

/** 批量选择模式状态 */
let batchSelectMode = false;

/** 已选择的卡片ID集合 */
let selectedCardIds = new Set();

/** 当前主题模式: 'auto' | 'light' | 'dark' */
let themeMode = localStorage.getItem('nav_theme_mode') || 'auto';

/** 是否启用简约模式（无模糊） */
let simpleMode = localStorage.getItem('nav_simple_mode') === 'true';

// ==================== 安全与工具函数 ====================
const hashPassword = async (password) => {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// ==================== 初始化入口 ====================
document.addEventListener('DOMContentLoaded', () => {
    // 注册 Service Worker（PWA 支持）
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/ServiceWorker.js')
                .catch(err => console.log('SW 注册失败:', err));
        });
    }

    // 初始化主题模式
    initThemeMode();

    // 初始化简约模式
    initSimpleMode();

    // 全局监听卡片点击，统计访问频次
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

    // 初始化样式切换按钮
    initStyleSwitcher();

    // 初始化应用
    init();
});

// ==================== 样式切换 ====================

/** 初始化样式切换按钮 */
const initStyleSwitcher = () => {
    document.querySelectorAll('.style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const style = parseInt(btn.getAttribute('data-style'));
            setViewStyle(style);
        });
    });
    // 恢复上次的样式
    applyViewStyle(currentViewStyle);
};

/** 切换展示样式 */
const setViewStyle = (style) => {
    if (currentViewStyle === style) return; // 相同样式无需处理
    currentViewStyle = style;
    localStorage.setItem('nav_view_style', style);
    applyViewStyle(style);
    renderNav(); // 重新渲染卡片以匹配新样式的 DOM 结构
};

/** 应用样式（更新 body class 和按钮高亮） */
const applyViewStyle = (style) => {
    document.body.classList.remove('view-style-0', 'view-style-2');
    if (style !== 0) {
        document.body.classList.add('view-style-' + style);
    }
    document.querySelectorAll('.style-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.getAttribute('data-style')) === style);
    });
};

// ==================== 主题切换功能 ====================

/** 初始化主题模式 */
const initThemeMode = () => {
    applyThemeMode();
};

/** 应用主题模式 */
const applyThemeMode = () => {
    document.body.classList.remove('light-theme', 'dark-theme');
    if (themeMode === 'light') {
        document.body.classList.add('light-theme');
    } else if (themeMode === 'dark') {
        document.body.classList.add('dark-theme');
    }
};

/** 切换主题模式 */
const toggleThemeMode = () => {
    if (themeMode === 'auto') {
        themeMode = 'light';
    } else if (themeMode === 'light') {
        themeMode = 'dark';
    } else {
        themeMode = 'auto';
    }
    localStorage.setItem('nav_theme_mode', themeMode);
    applyThemeMode();
    showToast(`主题: ${getThemeModeLabel()}`);
};

/** 获取主题模式标签 */
const getThemeModeLabel = () => {
    const labels = { auto: '跟随系统', light: '亮色', dark: '暗色' };
    return labels[themeMode] || '跟随系统';
};

// ==================== 简约模式功能 ====================

/** 初始化简约模式 */
const initSimpleMode = () => {
    if (simpleMode) {
        document.body.classList.add('no-blur');
    }
};

/** 切换简约模式 */
const toggleSimpleMode = () => {
    simpleMode = !simpleMode;
    localStorage.setItem('nav_simple_mode', simpleMode);
    document.body.classList.toggle('no-blur', simpleMode);
    showToast(simpleMode ? '已开启简约模式' : '已关闭简约模式');
};

// ==================== 核心函数 ====================

const updateGridWidth = () => {
    const width = (appData.settings && appData.settings.cardWidth)
        ? appData.settings.cardWidth
        : 85;
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
    let fetchUrl = '/api/config';
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
        const res = await fetch(fetchUrl, {
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

/**
 * 生成网站卡片的 innerHTML
 * @param {Object} item - 网站数据
 * @param {string} adminHtml - 管理员操作按钮 HTML
 * @param {number} style - 当前样式（0 或 2）
 */
const buildCardInnerHTML = (item, adminHtml, style) => {
    let fallbackAttr = `onerror="this.outerHTML='<span class=\\'emoji-icon\\'>'+window.utils.getRandomEmoji()+'</span>';"`;
    const safeIcon = utils.escapeHTML(item.icon);
    const isImgIcon = item.icon && item.icon.startsWith('http');
    const iconHtml = isImgIcon
        ? `<img src="${safeIcon}" loading="lazy" ${fallbackAttr}>`
        : `<span class="emoji-icon">${safeIcon || '🔗'}</span>`;

    const safeUrl = utils.escapeHTML(item.url);
    const safeTitle = utils.escapeHTML(item.title);

    if (style === 2) {
        // 缤纷模式布局：图标在左，标题在右
        return `${adminHtml}<a href="${safeUrl}" target="_blank">
            <div class="icon-wrapper">${iconHtml}</div>
            <div class="card-text-block">
                <h3>${safeTitle}</h3>
            </div>
        </a>`;
    } else {
        // 默认网格布局：图标在上，标题在下
        return `${adminHtml}<a href="${safeUrl}" target="_blank"><div class="icon-wrapper">${iconHtml}</div><h3>${safeTitle}</h3></a>`;
    }
};

// ==================== 批量选择功能 ====================

/** 切换卡片选中状态 */
const toggleCardSelection = (id) => {
    if (selectedCardIds.has(id)) {
        selectedCardIds.delete(id);
    } else {
        selectedCardIds.add(id);
    }
    updateBatchUI();
    renderNav();
};

/** 更新批量操作UI */
const updateBatchUI = () => {
    let batchBar = document.querySelector('.batch-actions-bar');
    if (selectedCardIds.size > 0) {
        if (!batchBar) {
            batchBar = document.createElement('div');
            batchBar.className = 'batch-actions-bar';
            batchBar.innerHTML = `
                <span>已选 <b id="batch-count">0</b> 项</span>
                <button class="batch-btn move" id="batch-move-btn">移动到分类</button>
                <button class="batch-btn delete" id="batch-delete-btn">批量删除</button>
                <button class="batch-btn" id="batch-cancel-btn" style="background:rgba(150,150,150,0.8); color:white;">取消</button>
            `;
            document.body.appendChild(batchBar);
            
            document.getElementById('batch-delete-btn').addEventListener('click', batchDelete);
            document.getElementById('batch-move-btn').addEventListener('click', showBatchMoveDialog);
            document.getElementById('batch-cancel-btn').addEventListener('click', clearSelection);
        }
        batchBar.classList.add('visible');
        document.getElementById('batch-count').textContent = selectedCardIds.size;
    } else {
        if (batchBar) {
            batchBar.classList.remove('visible');
        }
    }
};

/** 清空选择 */
const clearSelection = () => {
    selectedCardIds.clear();
    updateBatchUI();
    renderNav();
};

/** 批量删除 */
const batchDelete = () => {
    if (selectedCardIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedCardIds.size} 个网站？`)) return;
    
    appData.items = appData.items.filter(item => !selectedCardIds.has(item.id));
    clearSelection();
    saveAll(false);
    showToast('批量删除成功');
};

/** 显示批量移动对话框 */
const showBatchMoveDialog = () => {
    if (selectedCardIds.size === 0) return;
    
    const cats = appData.categories;
    const catOptions = cats.map(c => `<option value="${c.id}">${utils.escapeHTML(c.icon)} ${utils.escapeHTML(c.name)}</option>`).join('');
    
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.style.display = 'flex';
    dialog.innerHTML = `
        <div class="modal-content" style="text-align:center">
            <h3 style="margin-bottom:15px;">移动到分类</h3>
            <select id="batch-move-cat" style="width:100%; margin-bottom:15px;">${catOptions}</select>
            <div style="display:flex; gap:10px;">
                <button class="tab-btn active" id="batch-move-confirm" style="flex:1;">确认移动</button>
                <button class="tab-btn" id="batch-move-cancel" style="flex:1; background:rgba(150,150,150,0.5);">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    
    document.getElementById('batch-move-cancel').addEventListener('click', () => {
        document.body.removeChild(dialog);
    });
    
    document.getElementById('batch-move-confirm').addEventListener('click', () => {
        const targetCatId = document.getElementById('batch-move-cat').value;
        appData.items.forEach(item => {
            if (selectedCardIds.has(item.id)) {
                item.catId = targetCatId;
            }
        });
        document.body.removeChild(dialog);
        clearSelection();
        saveAll(false);
        showToast(`已移动 ${selectedCardIds.size} 个网站到目标分类`);
    });
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
            renderNav();
        });
        tabs.appendChild(btn);
    });

    const activeCat = cats.find(c => c.id === activeCatId);
    if (activeCat) {
        const grid = document.createElement('div');
        grid.id = 'grid-' + activeCat.id;
        grid.className = 'nav-grid active';

        grid.addEventListener('click', (e) => {
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
            if (e.target.closest('.card-add-new')) {
                e.preventDefault();
                e.stopPropagation();
                openItemEdit('', activeCat ? activeCat.id : '');
            }
        });

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
            card.className = 'card' + (item.hidden ? ' hidden-item' : '');
            card.setAttribute('data-id', utils.escapeHTML(item.id));

            // 缤纷模式：应用用户自定义网格背景色
            if (currentViewStyle === 2 && item.bgColor) {
                card.style.setProperty('--card-bg-color', item.bgColor);
                card.classList.add('has-bg');
            }

            const safeDesc = utils.escapeHTML(item.desc || '');
            const safeTitle = utils.escapeHTML(item.title);
            const tooltip = safeDesc ? `${safeTitle}\n${safeDesc}` : safeTitle;
            card.setAttribute('data-tooltip', tooltip);

            let adminHtml = '';
            if (isAdmin && activeCat.id !== 'VIRTUAL_FREQ') {
                adminHtml = `<div class="admin-actions">
                    <button class="action-mini batch-select-btn" data-id="${utils.escapeHTML(item.id)}"><i class="ri-checkbox-${selectedCardIds.has(item.id) ? 'fill' : 'blank-line'}"></i></button>
                    <button class="action-mini" data-action="toggleHide" data-id="${utils.escapeHTML(item.id)}"><i class="ri-eye-${item.hidden ? 'off-' : ''}line"></i></button>
                    <button class="action-mini" data-action="edit" data-id="${utils.escapeHTML(item.id)}"><i class="ri-edit-line"></i></button>
                    <button class="action-mini" data-action="delete" data-id="${utils.escapeHTML(item.id)}"><i class="ri-delete-bin-line"></i></button>
                </div>`;
            }

            card.innerHTML = buildCardInnerHTML(item, adminHtml, currentViewStyle);
            
            if (selectedCardIds.has(item.id)) {
                card.classList.add('selected');
            }
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
        
        // 添加批量选择事件监听
        if (isAdmin && activeCat.id !== 'VIRTUAL_FREQ') {
            grid.querySelectorAll('.batch-select-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = btn.getAttribute('data-id');
                    toggleCardSelection(id);
                });
            });
        }

        // 初始化拖拽排序
        if (isAdmin && typeof Sortable !== 'undefined' && activeCat.id !== 'VIRTUAL_FREQ') {
            new Sortable(grid, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                filter: '.card-add-new',
                onMove: (evt) => {
                    if (evt.related.classList.contains('card-add-new')) return false;
                },
                onEnd: () => {
                    const newIdOrder = Array.from(grid.querySelectorAll('.card[data-id]'))
                        .map(el => el.getAttribute('data-id'));

                    const currentCatItems = appData.items.filter(i => i.catId === activeCat.id);
                    const sortedCurrentItems = newIdOrder.map(id => currentCatItems.find(i => i.id === id));

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
    }
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
        <div class="form-row"><label>网站 URL</label><input id="f-url" value="${safeUrl}"></div>
        <div class="form-row"><label>网站名称</label><input id="f-title" value="${safeTitle}"></div>
        <div class="form-row"><label>网站说明</label><input id="f-desc" value="${safeDesc}" placeholder="选填，鼠标悬停时显示"></div>
        <div class="form-row"><label>当前图标</label>
            <div style="display:flex; width:100%; align-items:center;">
                <input id="f-icon" value="${safeIcon}" placeholder="可手动填入，或选择下方智能接口">
                <div id="preview-box" class="preview-container"></div>
            </div>
        </div>
        <div class="form-row"><label style="font-size:12px; font-weight:normal; color:#999;">Favicon.im</label>
            <div style="display:flex; align-items:center; width:100%;">
                <input type="radio" name="icon_sel" id="opt-fav1" style="width:18px; height:18px; flex-shrink:0; margin:0 10px 0 0; cursor:pointer;">
                <input id="txt-fav1" readonly placeholder="等待填写 URL 自动解析..." style="flex:1; min-width:0; color:#aaa; font-size:13px; cursor:pointer; background:rgba(0,0,0,0.3);">
                <div class="preview-container" style="background:rgba(0,0,0,0.3);"><img id="img-fav1" src="" loading="lazy"></div>
            </div>
        </div>
        <div class="form-row"><label style="font-size:12px; font-weight:normal; color:#999;">DuckDuckGo</label>
            <div style="display:flex; align-items:center; width:100%;">
                <input type="radio" name="icon_sel" id="opt-fav2" style="width:18px; height:18px; flex-shrink:0; margin:0 10px 0 0; cursor:pointer;">
                <input id="txt-fav2" readonly placeholder="等待填写 URL 自动解析..." style="flex:1; min-width:0; color:#aaa; font-size:13px; cursor:pointer; background:rgba(0,0,0,0.3);">
                <div class="preview-container" style="background:rgba(0,0,0,0.3);"><img id="img-fav2" src="" loading="lazy"></div>
            </div>
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
        <div class="form-row" style="border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 15px; margin-bottom: 15px;">
            <label style="font-size:12px; font-weight:normal; color:#999;">智能 Emoji</label>
            <div style="display:flex; flex-direction:column; width:100%; gap:5px;">
                <div style="display:flex; gap:5px; align-items:center;">
                    <input id="emoji-recommend-title" value="${safeTitle}" placeholder="输入网站名称获取推荐" style="flex:1;">
                    <button type="button" class="manage-cat-btn" id="btn-emoji-recommend" style="border: 1px solid var(--primary); color: white; background: var(--primary);">推荐</button>
                    <button type="button" class="manage-cat-btn" id="btn-emoji-refresh" title="换一组" style="padding:8px 12px;">🔄</button>
                </div>
                <div id="emoji-results" style="display:flex; flex-wrap:wrap; gap:5px; max-height:60px; overflow-y:auto; margin-top:5px;">
                    ${safeIcon && !safeIcon.startsWith('http') ? `<span class="emoji-suggestion selected" data-emoji="${safeIcon}">${safeIcon}</span>` : ''}
                </div>
            </div>
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

    // 背景色取色器与输入框联动
    const colorInput = document.getElementById('f-bg-color');
    const colorText = document.getElementById('f-bg-color-text');
    colorInput.addEventListener('input', () => { colorText.value = colorInput.value; });
    colorText.addEventListener('input', () => {
        if (/^#[0-9a-fA-F]{6}$/.test(colorText.value)) {
            colorInput.value = colorText.value;
        }
    });

    document.getElementById('f-url').addEventListener('input', (e) => debouncedHandleUrlInput(e.target.value));
    document.getElementById('f-icon').addEventListener('input', (e) => updatePreview(e.target.value));

    ['1', '2'].forEach(num => {
        const opt = document.getElementById('opt-fav' + num);
        const txt = document.getElementById('txt-fav' + num);
        opt.addEventListener('change', () => selectIcon(txt.value));
        txt.addEventListener('click', () => {
            if (txt.value) { opt.checked = true; selectIcon(txt.value); }
        });
    });

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

    const EMOJI_KEYWORDS = {
        'github': '🐙', 'git': '📦', 'code': '💻', '编程': '💻', '开发': '🛠️',
        'google': '🔍', 'search': '🔍', '搜索': '🔍',
        'youtube': '📺', 'video': '🎬', '视频': '🎬', 'music': '🎵', '音乐': '🎵',
        'twitter': '🐦', 'facebook': '👥', 'social': '🌐', '社交': '🌐',
        'mail': '📧', 'email': '📧', '邮箱': '📧', 'message': '💬', '消息': '💬',
        'shop': '🛒', 'store': '🏪', '购物': '🛒', 'buy': '🛍️',
        'game': '🎮', 'games': '🎲', '游戏': '🎮', 'play': '▶️',
        'book': '📚', 'read': '📖', 'learn': '📝', '学习': '📚', '教育': '🎓',
        'news': '📰', 'newspaper': '📰', '新闻': '📰', 'blog': '📝',
        'weather': '🌤️', 'weather': '🌤️', '天气': '🌤️',
        'photo': '📷', 'image': '🖼️', '图片': '🖼️', 'camera': '📸',
        'food': '🍔', 'restaurant': '🍽️', '美食': '🍜', 'eat': '🍕',
        'travel': '✈️', 'trip': '🧳', '旅行': '🧳', 'map': '🗺️',
        'money': '💰', 'finance': '💵', 'pay': '💳', '支付': '💳', 'bank': '🏦',
        'cloud': '☁️', 'cloudflare': '☁️', 'aws': '☁️', 'server': '🖥️',
        'chat': '💬', 'message': '💬', 'talk': '🗣️', 'ai': '🤖', 'bot': '🤖',
        'home': '🏠', 'house': '🏡', 'home': '🏠', '生活': '🏠',
        'work': '💼', 'office': '🏢', 'business': '💼', '工作': '💼',
        'health': '🏥', 'medical': '🏥', '医院': '🏥', 'doctor': '👨‍⚕️',
        'sport': '⚽', 'sports': '🏃', '运动': '⚽', 'fitness': '💪',
        'star': '⭐', 'favorite': '⭐', '收藏': '⭐', 'bookmark': '🔖',
        'setting': '⚙️', 'config': '🔧', '设置': '⚙️', 'tool': '🛠️',
        'download': '⬇️', 'upload': '⬆️', 'file': '📁', 'folder': '📁',
        'link': '🔗', 'connect': '🔗', 'chain': '🔗', '链接': '🔗',
        'lock': '🔒', 'security': '🔐', 'secure': '🔒', '安全': '🔐',
        'design': '🎨', 'art': '🎨', 'creative': '🎨', '设计': '🎨',
        'api': '🔌', 'data': '📊', 'database': '🗄️', '数据': '📊',
        'terminal': '💻', 'console': '⌨️', 'ssh': '🔐', '命令': '⌨️',
        'wifi': '📶', 'network': '🌐', 'internet': '🌐', 'web': '🌐',
        'notification': '🔔', 'bell': '🔔', 'alert': '⚠️', '通知': '🔔',
        'fire': '🔥', 'hot': '🔥', 'trending': '📈', '热门': '🔥',
        'bookmark': '🔖', 'save': '💾', 'flag': '🚩', '标记': '🔖'
    };

    const getRecommendedEmojis = (title) => {
        const results = new Set();
        const lowerTitle = title.toLowerCase();
        for (const [keyword, emoji] of Object.entries(EMOJI_KEYWORDS)) {
            if (lowerTitle.includes(keyword)) {
                results.add(emoji);
            }
        }
        if (results.size === 0) {
            const pool = window.emojiPool ? window.emojiPool.getRandomEmojis(8) : ['🌐', '🔗', '📌', '⭐', '💡', '✨', '🎯', '🚀'];
            return pool;
        }
        const extras = window.emojiPool ? window.emojiPool.getRandomEmojis(4) : ['🌟', '💫', '✨', '🔮'];
        return [...results, ...extras].slice(0, 8);
    };

    const renderEmojiSuggestions = (emojis) => {
        const container = document.getElementById('emoji-results');
        if (!container) return;
        container.innerHTML = '';
        emojis.forEach(emoji => {
            const span = document.createElement('span');
            span.className = 'emoji-suggestion';
            span.textContent = emoji;
            span.dataset.emoji = emoji;
            span.style.cssText = 'cursor:pointer; padding:4px 8px; font-size:20px; border-radius:6px; background:rgba(255,255,255,0.1); transition:0.2s;';
            span.onmouseover = () => span.style.background = 'rgba(57,157,255,0.3)';
            span.onmouseout = () => span.style.background = 'rgba(255,255,255,0.1)';
            span.onclick = () => {
                document.querySelectorAll('.emoji-suggestion').forEach(el => el.classList.remove('selected'));
                span.classList.add('selected');
                selectIcon(emoji);
            };
            container.appendChild(span);
        });
    };

    const recommendEmojis = () => {
        const title = document.getElementById('emoji-recommend-title').value;
        const emojis = getRecommendedEmojis(title || safeTitle);
        renderEmojiSuggestions(emojis);
    };

    document.getElementById('btn-emoji-recommend').addEventListener('click', recommendEmojis);
    document.getElementById('btn-emoji-refresh').addEventListener('click', () => {
        const title = document.getElementById('emoji-recommend-title').value;
        const emojis = getRecommendedEmojis(title || safeTitle);
        renderEmojiSuggestions(emojis);
    });
    document.getElementById('emoji-recommend-title').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') recommendEmojis();
    });

    updatePreview(item.icon);
    if (item.url) handleUrlInput(item.url, false);
    document.getElementById('edit-modal').style.display = 'flex';
};

const selectIcon = (url) => {
    if (!url) return;
    document.getElementById('f-icon').value = url;
    updatePreview(url);
};

const handleUrlInput = (url, autoSelect = true) => {
    if (url && url.startsWith('http')) {
        try {
            const domain = new URL(url).hostname;
            const icon1 = "https://favicon.im/" + domain;
            const icon2 = "https://icons.duckduckgo.com/ip3/" + domain + ".ico";

            document.getElementById('txt-fav1').value = icon1;
            document.getElementById('img-fav1').src = icon1;
            document.getElementById('txt-fav2').value = icon2;
            document.getElementById('img-fav2').src = icon2;

            const currentIconVal = document.getElementById('f-icon').value;
            if (autoSelect && !currentIconVal) {
                document.getElementById('opt-fav1').checked = true;
                selectIcon(icon1);
            } else if (currentIconVal === icon1) {
                document.getElementById('opt-fav1').checked = true;
            } else if (currentIconVal === icon2) {
                document.getElementById('opt-fav2').checked = true;
            } else {
                document.getElementById('opt-fav1').checked = false;
                document.getElementById('opt-fav2').checked = false;
            }
        } catch (e) { }
    } else {
        document.getElementById('txt-fav1').value = "";
        document.getElementById('img-fav1').src = "";
        document.getElementById('opt-fav1').checked = false;
        document.getElementById('txt-fav2').value = "";
        document.getElementById('img-fav2').src = "";
        document.getElementById('opt-fav2').checked = false;
    }
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

const manageCats = () => {
    editingType = 'cats';
    document.getElementById('edit-title').innerText = '偏好与分类设置';

    const currentWidth = (appData.settings && appData.settings.cardWidth) ? appData.settings.cardWidth : 85;
    const currentBg = (appData.settings && appData.settings.bgUrl) ? appData.settings.bgUrl : '';
    const bgIsColor = /^#[0-9a-fA-F]{6}$/.test(currentBg);

    const themeOptions = [
        { value: 'auto', label: '跟随系统' },
        { value: 'light', label: '亮色模式' },
        { value: 'dark', label: '暗色模式' }
    ].map(opt => `<option value="${opt.value}" ${themeMode === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('');

    document.getElementById('edit-form-body').innerHTML = `
        <div class="form-row" style="margin-bottom: 10px;">
            <label>网格宽度</label><input type="number" id="setting-width" value="${currentWidth}"><span style="color:#666; margin-left:10px;">px</span>
        </div>
        <div class="form-row" style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 20px;">
            <label>自定义背景</label>
            <div style="display:flex; align-items:center; gap:8px; flex:1;">
                <input type="color" id="setting-bg-color" value="${bgIsColor ? currentBg : '#222222'}" style="width:40px; height:36px; padding:2px; border:none; border-radius:6px; cursor:pointer; background:transparent; flex-shrink:0;">
                <input type="text" id="setting-bg" value="${utils.escapeHTML(currentBg)}" placeholder="填URL或纯色(如#222), 留空使用Bing" style="flex:1;">
            </div>
        </div>
        <div class="form-row" style="margin-bottom: 15px;">
            <label>主题模式</label>
            <select id="setting-theme" style="flex:1;">${themeOptions}</select>
        </div>
        <div class="form-row" style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 20px;">
            <label>简约模式</label>
            <div style="display:flex; align-items:flex-start; gap:10px; flex:1;">
                <input type="checkbox" id="setting-simple-mode" ${simpleMode ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer; margin-top:2px;">
                <span style="font-size:12px; color:#999; line-height:1.4;">关闭模糊效果（提升低端设备性能）</span>
            </div>
        </div>
        <div id="cat-list-sort" style="max-height: 300px; overflow-y: auto;">
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

    document.getElementById('setting-width').addEventListener('input', (e) => changeCardWidth(e.target.value));

    document.getElementById('setting-theme').addEventListener('change', (e) => {
        themeMode = e.target.value;
        localStorage.setItem('nav_theme_mode', themeMode);
        applyThemeMode();
    });

    document.getElementById('setting-simple-mode').addEventListener('change', (e) => {
        simpleMode = e.target.checked;
        localStorage.setItem('nav_simple_mode', simpleMode);
        document.body.classList.toggle('no-blur', simpleMode);
    });

    const bgColorPicker = document.getElementById('setting-bg-color');
    const bgTextInput = document.getElementById('setting-bg');
    // 取色器 → 文字输入框联动
    bgColorPicker.addEventListener('input', () => {
        bgTextInput.value = bgColorPicker.value;
        if (!appData.settings) appData.settings = {};
        appData.settings.bgUrl = bgColorPicker.value;
        applyBackgroundConfig();
    });
    // 文字输入框 → 取色器联动
    bgTextInput.addEventListener('input', () => {
        const val = bgTextInput.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
            bgColorPicker.value = val;
        }
        if (!appData.settings) appData.settings = {};
        appData.settings.bgUrl = val;
        applyBackgroundConfig();
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
        onEnd: () => {
            const newIdOrder = Array.from(catListSort.querySelectorAll('.cat-item-row'))
                .map(el => el.getAttribute('data-id'));
            appData.categories = newIdOrder.map(id => appData.categories.find(c => c.id === id));

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
