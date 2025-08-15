/**
 * StorageService - Chrome Extension Storage Service
 */
export default class StorageService {
  constructor(key = 'kindleReviewMeter') {
    this.storageKey = key;
  }

  async save(data) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ [this.storageKey]: data });
      } else {
        localStorage.setItem(this.storageKey, JSON.stringify(data));
      }
      return true;
    } catch (error) {
      console.error('Storage save failed:', error);
      return false;
    }
  }

  async load() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get([this.storageKey]);
        return result[this.storageKey] || null;
      } else {
        const data = localStorage.getItem(this.storageKey);
        return data ? JSON.parse(data) : null;
      }
    } catch (error) {
      console.error('Storage load failed:', error);
      return null;
    }
  }

  async clear() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.remove([this.storageKey]);
      } else {
        localStorage.removeItem(this.storageKey);
      }
      return true;
    } catch (error) {
      console.error('Storage clear failed:', error);
      return false;
    }
  }
}

