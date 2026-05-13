/**
 * Service Worker - 离线缓存支持
 */

const CACHE_NAME = 'inspection-checkin-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/style.css',
  '/admin-style.css',
  '/utils.js',
  '/checkin.js',
  '/admin.js'
];

// 安装事件 - 缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: 缓存静态资源');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: 清理旧缓存', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 请求拦截 - 网络优先，失败时从缓存读取
self.addEventListener('fetch', (event) => {
  // 跳过非 GET 请求
  if (event.request.method !== 'GET') {
    return;
  }

  // 跳过 API 请求（需要实时数据）
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 网络请求成功，更新缓存
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // 网络失败，从缓存读取
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('Service Worker: 从缓存读取', event.request.url);
            return cachedResponse;
          }
          // 缓存也没有，返回离线页面
          return caches.match('/index.html');
        });
      })
  );
});

// 后台同步（当网络恢复时自动同步离线数据）
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-checkins') {
    event.waitUntil(syncCheckins());
  }
});

async function syncCheckins() {
  // 从 IndexedDB 获取未同步的打卡记录
  // 发送到服务器
  console.log('Service Worker: 同步离线打卡记录');
}
