/**
 * ==========================================
 * app.js - 核心前端逻辑
 * CloudNav 个人导航页主程序
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

// ==================== 初始化入口 ====================
document.addEventListener('DOMContentLoaded', () => {
    // 注册 Service Worker（PWA 支持）
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/ServiceWorker.js')
                .catch(err => console.log('SW 注册失败:', err));
        });
    }

    // 初始化应用
    init();
});

// ==================== 核心函数 ====================

/**
 * 更新网格卡片宽度
 * @description 将配置中的卡片宽度注入到 CSS 变量
 */
const updateGridWidth = () => {
    const width = (appData.settings && appData.settings.cardWidth) 
        ? appData.settings.cardWidth 
        : 85;
    document.documentElement.style.setProperty('--card-w', width + 'px');
};

/**
 * 显示全局加载动画
 * @param {string} text - 加载提示文字
 */
const showLoader = (text = '正在处理中...') => {
    document.getElementById('global-loading-text').innerText = text;
    document.getElementById('global-loading-overlay').style.display = 'flex';
};

/**
 * 隐藏全局加载动画
 */
const hideLoader = () => {
    document.getElementById('global-loading-overlay').style.display = 'none';
};

/**
 * 显示Toast提示
 * @param {string} msg - 提示消息
 * @param {string} color - 背景颜色（默认绿色）
 */
const showToast = (msg = "操作成功", color = "#27ae60") => {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.style.background = color;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
};

/**
 * 切换骨架屏显示状态
 * @param {boolean} show - 是否显示骨架屏
 */
const toggleSkeleton = (show) => {
    document.getElementById('skeleton-screen').style.display = show ? 'block' : 'none';
    document.getElementById('main-content').style.display = show ? 'none' : 'block';
};

/**
 * 加载背景图片
 * @param {string} url - 图片URL
 * @description 使用缓存机制优化背景加载体验
 */
const loadBackground = async (url) => {
    if (!url) return;
    try {
        const bgCacheName = 'nav-bg-cache-v1';
        const cache = await caches.open(bgCacheName);
        const cachedResponse = await cache.match(url);

        // 如果有缓存，立即显示
        if (cachedResponse) {
            const blob = await cachedResponse.blob();
            document.body.style.backgroundImage = `url('${URL.createObjectURL(blob)}')`;
        }

        // 后台更新缓存
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
        // 降级方案：直接设置背景
        const img = new Image();
        img.src = url;
        img.onload = () => {
            document.body.style.backgroundImage = `url('${url}')`;
        };
    }
};

/**
 * 初始化应用
 * @param {boolean} forceRender - 是否强制重新渲染
 * @description 从API获取数据并渲染界面
 */
const init = async (forceRender = false) => {
    let fetchUrl = '/api/config';
    const gridContainer = document.getElementById('grid-container');
    const localCache = localStorage.getItem('nav_app_data');
    let initialIsAdmin = isAdmin;

    // 优先使用本地缓存快速渲染
    if (localCache) {
        try {
            appData = JSON.parse(localCache);
            isAdmin = appData.isAdmin || false;
            initialIsAdmin = isAdmin;
            updateGridWidth();
            toggleSkeleton(false);
            renderTools();
            renderNav();
            if (appData.bgUrl) loadBackground(appData.bgUrl);
            if (appData.lastUpdated) {
                document.getElementById('footer-cache').innerText = '最后同步：' + utils.escapeHTML(appData.lastUpdated);
            }
        } catch (e) {
            toggleSkeleton(true);
        }
    } else {
        toggleSkeleton(true);
    }

    // 从服务器获取最新数据
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

        if (appData.bgUrl) loadBackground(appData.bgUrl);

        // 数据变化或管理员状态变化时重新渲染
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

/**
 * 渲染管理工具按钮
 * @description 根据管理员状态显示不同的操作按钮
 */
const renderTools = () => {
    const adminToolsContainer = document.getElementById('admin-tools');
    const catManageArea = document.getElementById('cat-manage-area');
    adminToolsContainer.innerHTML = '';

    // 创建浮动操作按钮
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
        // 管理员模式
        document.title = "管理后台";
        catManageArea.innerHTML = `<button class="manage-cat-btn" id="btn-manage-cats"><i class="ri-settings-line"></i> 偏好设置</button>`;
        document.getElementById('btn-manage-cats').addEventListener('click', manageCats);

        createFab('登出', '#e74c3c', doLogout);
        createFab('保存', 'var(--primary)', () => saveAll(false));
        createFab('导入', null, () => document.getElementById('import-file').click());
        createFab('导出', null, exportConfig);
        createFab('默认', null, resetConfig);
    } else {
        // 访客模式
        document.title = "个人导航";
        catManageArea.innerHTML = '';
        createFab('管理', null, () => {
            document.getElementById('auth-overlay').style.display = 'flex';
            setTimeout(() => document.getElementById('auth-input').focus(), 100);
        });
    }
};

/**
 * 渲染导航内容
 * @description 渲染分类标签和网站卡片
 */
const renderNav = () => {
    const tabs = document.getElementById('tabs');
    const container = document.getElementById('grid-container');
    tabs.innerHTML = '';
    container.innerHTML = '';

    // 过滤隐藏分类（非管理员模式）
    const cats = isAdmin ? appData.categories : appData.categories.filter(c => !c.hidden);

    // 设置默认激活分类
    if (cats.length > 0 && !activeCatId) activeCatId = cats[0].id;
    if (!cats.find(c => c.id === activeCatId) && cats.length > 0) activeCatId = cats[0].id;

    // 渲染分类标签
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

    // 渲染当前分类的网站卡片
    const activeCat = cats.find(c => c.id === activeCatId);
    if (activeCat) {
        const grid = document.createElement('div');
        grid.id = 'grid-' + activeCat.id;
        grid.className = 'nav-grid active';

        // 卡片点击事件委托
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
            // 新增按钮
            if (e.target.closest('.card-add-new')) {
                e.preventDefault();
                e.stopPropagation();
                openItemEdit('', activeCat ? activeCat.id : '');
            }
        });

        const fragment = document.createDocumentFragment();
        // 过滤隐藏项目（非管理员模式）
        let catItems = appData.items.filter(i => i.catId === activeCat.id && (isAdmin || !i.hidden));

        // 渲染卡片
        catItems.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'card' + (item.hidden ? ' hidden-item' : '');
            card.setAttribute('data-id', utils.escapeHTML(item.id));

            // 图标处理（URL 或 Emoji）
            let fallbackAttr = `onerror="this.outerHTML='<span class=\\'emoji-icon\\'>'+window.utils.getRandomEmoji()+'</span>';"`;
            const safeIcon = utils.escapeHTML(item.icon);
            const iconHtml = (item.icon && item.icon.startsWith('http'))
                ? `<img src="${safeIcon}" loading="lazy" ${fallbackAttr}>`
                : `<span class="emoji-icon">${safeIcon || '🔗'}</span>`;

            const safeUrl = utils.escapeHTML(item.url);
            const safeTitle = utils.escapeHTML(item.title);
            const safeDesc = utils.escapeHTML(item.desc || '');

            // 提示框内容
            const tooltip = safeDesc ? `${safeTitle}\n${safeDesc}` : safeTitle;
            card.setAttribute('data-tooltip', tooltip);

            // 管理员操作按钮
            let adminHtml = '';
            if (isAdmin) {
                adminHtml = `<div class="admin-actions">
                    <button class="action-mini" data-action="toggleHide" data-id="${utils.escapeHTML(item.id)}"><i class="ri-eye-${item.hidden ? 'off-' : ''}line"></i></button>
                    <button class="action-mini" data-action="edit" data-id="${utils.escapeHTML(item.id)}"><i class="ri-edit-line"></i></button>
                    <button class="action-mini" data-action="delete" data-id="${utils.escapeHTML(item.id)}"><i class="ri-delete-bin-line"></i></button>
                </div>`;
            }

            card.innerHTML = `${adminHtml}<a href="${safeUrl}" target="_blank"><div class="icon-wrapper">${iconHtml}</div><h3>${safeTitle}</h3></a>`;
            fragment.appendChild(card);
        });

        // 新增卡片按钮（管理员模式）
        if (isAdmin) {
            const addCard = document.createElement('div');
            addCard.className = 'card card-add-new';
            addCard.style.borderStyle = 'dashed';
            addCard.innerHTML = '<a href="javascript:void(0)"><div class="icon-wrapper"><div class="emoji-icon">➕</div></div><h3>新增</h3></a>';
            fragment.appendChild(addCard);
        }

        grid.appendChild(fragment);
        container.appendChild(grid);

        // 初始化拖拽排序（管理员模式）
        if (isAdmin && typeof Sortable !== 'undefined') {
            new Sortable(grid, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                filter: '.dashed',
                onEnd: () => {
                    const newIdOrder = Array.from(grid.querySelectorAll('.card[data-id]')).map(el => el.getAttribute('data-id'));
                    const otherCatItems = appData.items.filter(i => i.catId !== activeCat.id);
                    const sortedCurrentItems = newIdOrder.map(id => appData.items.find(i => i.id === id));
                    appData.items = [...otherCatItems, ...sortedCurrentItems];
                    saveAll(true);
                }
            });
        }
    }
};

// ==================== 编辑相关函数 ====================

/**
 * 防抖处理的URL输入处理
 */
const debouncedHandleUrlInput = utils.debounce((val) => handleUrlInput(val), 500);

/**
 * 打开项目编辑弹窗
 * @param {string} id - 项目ID（空表示新增）
 * @param {string} catId - 所属分类ID
 */
const openItemEdit = (id, catId) => {
    editingType = 'items';
    editingId = id;

    // 获取或创建默认项目数据
    const item = id
        ? appData.items.find(i => i.id === id)
        : { id: 'i' + Date.now(), title: '', url: '', desc: '', icon: '', catId: catId };

    const safeUrl = utils.escapeHTML(item.url);
    const safeTitle = utils.escapeHTML(item.title);
    const safeIcon = utils.escapeHTML(item.icon);
    const safeDesc = utils.escapeHTML(item.desc || '');

    // 生成编辑表单HTML
    document.getElementById('edit-form-body').innerHTML = `
        <div class="form-row"><label>网站 URL</label><input id="f-url" value="${safeUrl}"></div>
        <div class="form-row"><label>网站名称</label><input id="f-title" value="${safeTitle}"></div>
        <div class="form-row"><label>网站说明</label><input id="f-desc" value="${safeDesc}" placeholder="选填，鼠标悬停时显示"></div>
        <div class="form-row"><label>图标设置</label>
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
        <div class="form-row"><label>归属分类</label><select id="f-cat">${appData.categories.map(c => `<option value="${utils.escapeHTML(c.id)}" ${c.id === item.catId ? 'selected' : ''}>${utils.escapeHTML(c.name)}</option>`).join('')}</select></div>
    `;

    // 绑定事件
    document.getElementById('f-url').addEventListener('input', (e) => debouncedHandleUrlInput(e.target.value));
    document.getElementById('f-icon').addEventListener('input', (e) => updatePreview(e.target.value));

    // 图标选择事件
    ['1', '2'].forEach(num => {
        const opt = document.getElementById('opt-fav' + num);
        const txt = document.getElementById('txt-fav' + num);
        opt.addEventListener('change', () => selectIcon(txt.value));
        txt.addEventListener('click', () => {
            if (txt.value) {
                opt.checked = true;
                selectIcon(txt.value);
            }
        });
    });

    updatePreview(item.icon);
    if (item.url) handleUrlInput(item.url, false);
    document.getElementById('edit-modal').style.display = 'flex';
};

/**
 * 选择图标
 * @param {string} url - 图标URL
 */
const selectIcon = (url) => {
    if (!url) return;
    document.getElementById('f-icon').value = url;
    updatePreview(url);
};

/**
 * 处理URL输入（自动获取图标）
 * @param {string} url - 网站URL
 * @param {boolean} autoSelect - 是否自动选择第一个图标
 */
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

/**
 * 更新图标预览
 * @param {string} val - 图标值（URL或Emoji）
 */
const updatePreview = (val) => {
    const box = document.getElementById('preview-box');
    if (!val) {
        box.innerHTML = '🔗';
        return;
    }
    const safeVal = utils.escapeHTML(val);
    if (safeVal.startsWith('http')) {
        let fallbackAttr = `onerror="this.outerHTML='<span class=\\'emoji-icon\\'>'+window.utils.getRandomEmoji()+'</span>';"`;
        box.innerHTML = `<img src="${safeVal}" loading="lazy" ${fallbackAttr}>`;
    } else {
        box.innerHTML = safeVal;
    }
};

/**
 * 管理分类设置
 */
const manageCats = () => {
    editingType = 'cats';
    document.getElementById('edit-title').innerText = '偏好与分类设置';

    const currentWidth = (appData.settings && appData.settings.cardWidth)
        ? appData.settings.cardWidth
        : 85;

    document.getElementById('edit-form-body').innerHTML = `
        <div class="form-row" style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 20px;">
            <label>网格宽度</label><input type="number" id="setting-width" value="${currentWidth}"><span style="color:#666; margin-left:10px;">px</span>
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

    // 绑定事件
    document.getElementById('setting-width').addEventListener('input', (e) => changeCardWidth(e.target.value));
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
        if (hideBtn) {
            e.preventDefault();
            toggleHide('categories', hideBtn.getAttribute('data-id'));
        }
        const delBtn = e.target.closest('.btn-cat-del');
        if (delBtn) {
            e.preventDefault();
            deleteObj('categories', delBtn.getAttribute('data-id'));
        }
    });

    // 分类拖拽排序
    new Sortable(catListSort, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        onEnd: () => {
            const newIdOrder = Array.from(catListSort.querySelectorAll('.cat-item-row')).map(el => el.getAttribute('data-id'));
            appData.categories = newIdOrder.map(id => appData.categories.find(c => c.id === id));
            renderNav();
            saveAll(true);
        }
    });

    document.getElementById('edit-modal').style.display = 'flex';
};

/**
 * 修改卡片宽度
 * @param {string} val - 宽度值（像素）
 */
const changeCardWidth = (val) => {
    if (!appData.settings) appData.settings = {};
    appData.settings.cardWidth = parseInt(val) || 85;
    updateGridWidth();
};

/**
 * 更新分类数据
 * @param {string} id - 分类ID
 * @param {string} field - 字段名
 * @param {string} val - 新值
 */
const updateCatData = (id, field, val) => {
    const cat = appData.categories.find(c => c.id === id);
    if (cat) cat[field] = val;
    renderNav();
};

/**
 * 新增分类
 */
const addCat = () => {
    appData.categories.push({
        id: 'c' + Date.now(),
        name: '新分类',
        icon: '📁',
        hidden: false
    });
    manageCats();
    renderNav();
};

/**
 * 确认编辑
 */
const confirmEdit = () => {
    if (editingType === 'items') {
        const url = document.getElementById('f-url').value;
        const title = document.getElementById('f-title').value;
        const desc = document.getElementById('f-desc').value;
        const icon = document.getElementById('f-icon').value;
        const catId = document.getElementById('f-cat').value;

        if (editingId) {
            const idx = appData.items.findIndex(i => i.id === editingId);
            if (idx > -1) {
                appData.items[idx] = { ...appData.items[idx], url, title, desc, icon, catId };
            }
        } else {
            appData.items.push({
                id: 'i' + Date.now(),
                url,
                title,
                desc,
                icon,
                catId,
                hidden: false
            });
        }
    }
    renderNav();
    closeModal();
    saveAll(false);
};

/**
 * 切换隐藏状态
 * @param {string} type - 类型（items/categories）
 * @param {string} id - 项目ID
 */
const toggleHide = (type, id) => {
    const item = appData[type].find(o => o.id === id);
    if (item) item.hidden = !item.hidden;
    saveAll(false);
    renderNav();
    if (type === 'categories') manageCats();
};

/**
 * 删除项目
 * @param {string} type - 类型（items/categories）
 * @param {string} id - 项目ID
 */
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

/**
 * 管理员登录
 */
const doLogin = async () => {
    showLoader('正在验证管理员身份...');
    sysToken = document.getElementById('auth-input').value;
    localStorage.setItem('nav_token', sysToken);
    document.getElementById('auth-overlay').style.display = 'none';

    await init(true);

    hideLoader();
    if (!isAdmin) {
        showToast("验证失败，Token 不正确", "#e74c3c");
        localStorage.removeItem('nav_token');
        sysToken = '';
        document.getElementById('auth-input').value = '';
    } else {
        showToast("已进入管理模式");
    }
};

/**
 * 管理员登出
 */
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

/**
 * 保存所有数据
 * @param {boolean} silent - 是否静默模式
 */
const saveAll = async (silent = false) => {
    if (!silent) showLoader('正在同步配置中...');

    const dataToSave = { ...appData };
    delete dataToSave.isAdmin;
    delete dataToSave.bgUrl;
    localStorage.setItem('nav_app_data', JSON.stringify(appData));

    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Authorization': sysToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToSave)
        });

        if (!silent) hideLoader();
        if (res.ok && !silent) {
            showToast("保存成功！");
        } else if (!res.ok && !silent) {
            showToast("保存失败，权限不足", "#e74c3c");
        }
    } catch (error) {
        if (!silent) {
            hideLoader();
            showToast("网络错误，配置仅保存在本地", "#e67e22");
        }
    }
};

/**
 * 导入配置文件
 * @param {Event} event - 文件选择事件
 */
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

/**
 * 导出配置文件
 */
const exportConfig = () => {
    const dataToExport = { ...appData };
    delete dataToExport.isAdmin;
    delete dataToExport.bgUrl;

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nav-config-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast("配置已导出");
};

/**
 * 重置为默认配置
 */
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

/**
 * 关闭编辑弹窗
 */
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
