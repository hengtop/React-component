interface HexArrayRecord {
  hash: string; // 唯一随机数作为主键
  hexArray: string[]; // 16进制字符串数组
  timestamp: number; // 时间戳
}

const DB_NAME = 'downloadChunks';
const STORE_NAME = 'fileChunks';
const DB_VERSION = 1;

class DBManager {
  static instance = null;
  db = null;
  pendingRequests = [];

  constructor() {
    if (!DBManager.instance) {
      DBManager.instance = this;
    }
    return DBManager.instance;
  }

  async getConnection() {
    if (this.db) return this.db;

    if (this.pending) {
      // 等待正在进行的连接请求
      return new Promise((resolve) => {
        this.pendingRequests.push(resolve);
      });
    }

    this.pending = true;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        this.pending = false;
        this.pendingRequests.forEach((resolve) => resolve(this.db));
        this.pendingRequests = [];
        resolve(this.db);
      };

      request.onerror = (e) => {
        this.pending = false;
        reject(e.target.error);
      };
    });
  }
}

const dbManager = new DBManager();

async function storeHexArray(record: HexArrayRecord) {
  const db = await dbManager.getConnection();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.put(record);

    request.onsuccess = () => resolve(record.hash);
    request.onerror = () => reject(request.error);
  });
}

async function getHexArray(hash: string): Promise<HexArrayRecord> {
  const db = await dbManager.getConnection();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(hash);

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result);
      } else {
        reject(new Error('Record not found'));
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export { getHexArray, storeHexArray };
