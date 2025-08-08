export class StorageService {
  constructor(key = 'amazonReviewTracker') {
    this.key = key;
  }

  save(data) {
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Save failed', e);
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Load failed', e);
      return null;
    }
  }

  clear() {
    try {
      localStorage.removeItem(this.key);
      return true;
    } catch (e) {
      console.error('Clear failed', e);
      return false;
    }
  }
}