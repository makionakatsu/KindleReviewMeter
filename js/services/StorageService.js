export class StorageService {
  constructor(key = 'amazonReviewTracker') { this.key = key; }
  save(data) {
    try { localStorage.setItem(this.key, JSON.stringify(data)); return true; }
    catch(e){ console.error('Save failed', e); return false; }
  }
  load() {
    try { const raw = localStorage.getItem(this.key); return raw ? JSON.parse(raw) : null; }
    catch(e){ console.error('Load failed', e); return null; }
  }
  clear() { try { localStorage.removeItem(this.key); return true; } catch { return false; } }
  export() {
    const data = this.load();
    if (!data) throw new Error('エクスポートするデータがありません');
    const payload = { version: '1.0', exported_at: new Date().toISOString(), app: 'Kindle Review Meter', data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0,10);
    a.download = `kindle_review_meter_${today}.json`;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 200);
  }
  async import(file) {
    const text = await file.text();
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || !obj.data) throw new Error('無効なファイル形式です');
    if (!obj.data.title && !obj.data.author) throw new Error('有効な書籍データが見つかりません');
    if (!this.save(obj.data)) throw new Error('データの保存に失敗しました');
    return obj.data;
  }
}

