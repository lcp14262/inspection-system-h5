/**
 * 工具函数库
 * NFC、GPS、照片压缩等通用功能
 */

/**
 * 格式化 NFC UID
 * @param {string} uid - 原始 UID
 * @returns {string} 格式化后的 UID（冒号分隔）
 */
export function formatNFCUid(uid) {
  return uid.match(/.{1,2}/g).join(':').toUpperCase();
}

/**
 * 压缩照片
 * @param {File} file - 原始照片文件
 * @param {number} maxWidth - 最大宽度
 * @param {number} quality - 压缩质量 (0-1)
 * @returns {Promise<string>} Base64 格式
 */
export async function compressPhoto(file, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 计算缩放比例
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.floor(img.width * scale);
        const height = Math.floor(img.height * scale);

        // 创建 canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // 压缩并转换为 base64
        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 计算两点间距离（Haversine 公式）
 * @param {number} lat1 - 起点纬度
 * @param {number} lng1 - 起点经度
 * @param {number} lat2 - 终点纬度
 * @param {number} lng2 - 终点经度
 * @returns {number} 距离（米）
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // 地球半径（米）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 检测是否支持 Web NFC
 * @returns {boolean}
 */
export function isNFCsupported() {
  return 'NDEFReader' in window;
}

/**
 * 检测是否在飞书内
 * @returns {boolean}
 */
export function isInLark() {
  return window.lark !== undefined;
}

/**
 * 检测 iOS 设备
 * @returns {boolean}
 */
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/**
 * 本地存储封装
 */
export const storage = {
  /**
   * 保存数据
   */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('LocalStorage 保存失败:', error);
    }
  },

  /**
   * 读取数据
   */
  get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (error) {
      console.error('LocalStorage 读取失败:', error);
      return defaultValue;
    }
  },

  /**
   * 删除数据
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('LocalStorage 删除失败:', error);
    }
  }
};

/**
 * 离线缓存管理（IndexedDB）
 */
export const offlineCache = {
  dbName: 'InspectionCheckinDB',
  version: 1,

  /**
   * 初始化数据库
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('checkins')) {
          db.createObjectStore('checkins', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  },

  /**
   * 保存打卡记录（离线时用）
   */
  async saveCheckin(data) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('checkins', 'readwrite');
      const store = tx.objectStore('checkins');
      const request = store.add({
        ...data,
        timestamp: Date.now(),
        synced: false
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * 获取未同步的记录
   */
  async getUnsyncedCheckins() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('checkins', 'readonly');
      const store = tx.objectStore('checkins');
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result.filter(r => !r.synced);
        resolve(records);
      };
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * 标记记录为已同步
   */
  async markSynced(id) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('checkins', 'readwrite');
      const store = tx.objectStore('checkins');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const data = getReq.result;
        data.synced = true;
        store.put(data);
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  },

  /**
   * 清空已同步的记录
   */
  async clearSynced() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('checkins', 'readwrite');
      const store = tx.objectStore('checkins');
      const request = store.getAll();
      request.onsuccess = () => {
        request.result.forEach(record => {
          if (record.synced) {
            store.delete(record.id);
          }
        });
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }
};

/**
 * Service Worker 注册
 */
export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('Service Worker 注册成功:', registration.scope);
    } catch (error) {
      console.error('Service Worker 注册失败:', error);
    }
  }
}

/**
 * 检查网络状态
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * 监听网络状态变化
 */
export function onNetworkChange(callback) {
  window.addEventListener('online', () => callback(true));
  window.addEventListener('offline', () => callback(false));
}
