/**
 * ==========================================
 * ServiceWorker.js - PWA 核心脚本
 * 实现 Stale-While-Revalidate 缓存策略
 * ==========================================
 */

// 缓存版本号（更新时需修改）
const CACHE_NAME = 'nav-cache-v3';

// 需要缓存的核心静态资源
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/style.css',
  '/assets/js/utils.js',
  '/assets/js/app.js',
  'https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js'
];

/**
 * 安装事件
 * @description 缓存核心静态资源，跳过等待直接激活
 */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(URLS_TO_CACHE))
  );
});

/**
 * 激活事件
 * @description 清理旧版本缓存，确保只保留当前版本
 */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

/**
 * 请求拦截事件
 * @description 实现 Stale-While-Revalidate 策略
 * - 有缓存立即返回（秒开体验）
 * - 同时后台更新缓存（下次访问使用最新资源）
 * - API 请求不走 SW 缓存，由前端 localStorage 控制
 */
self.addEventListener('fetch', event => {
  // API 请求不走 SW 缓存
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        // 发起网络请求获取最新资源
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // 将最新响应克隆并更新到缓存
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // 断网时静默处理
        });

        // 核心：有缓存立即返回，否则等待网络请求
        return cachedResponse || fetchPromise;
      });
    })
  );
});