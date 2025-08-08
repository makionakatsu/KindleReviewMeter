import { BookInfoService } from '../services/BookInfoService.js';
import { toast } from '../utils/ToastService.js';
import { modal } from '../utils/ModalService.js';

export class SettingsView {
  constructor(storage, validation) {
    this.storage = storage;
    this.validation = validation;
    this.state = null;
    this.fetcher = new BookInfoService();
  }

  async render(root) {
    this.state = this.storage.load() || {};
    root.innerHTML = `
      <div class="card grid interactive">
        <div>
          <label for="amazonUrl">Amazon書籍URL</label>
          <div class="row">
            <input id="amazonUrl" type="url" placeholder="https://www.amazon.co.jp/dp/..." value="${this.state.amazonUrl || ''}" />
            <button id="btnAutofill" class="btn">自動取得</button>
            <button id="btnManual" class="btn">✏️ 手動入力</button>
          </div>
          <p class="help">自動取得が難しい場合は「手動入力」で直接編集してください。</p>
        </div>

        <div id="manual" class="card hidden interactive">
          <div class="grid cols-2">
            <div>
              <label for="manualTitle">書籍タイトル</label>
              <input id="manualTitle" type="text" placeholder="書籍タイトル" value="${this.state.title || ''}" />
            </div>
            <div>
              <label for="manualAuthor">著者名</label>
              <input id="manualAuthor" type="text" placeholder="著者名" value="${this.state.author || ''}" />
            </div>
            <div>
              <label for="manualReviews">現在のレビュー数</label>
              <input id="manualReviews" type="number" min="0" value="${this.state.reviewCount || 0}" />
            </div>
            <div>
              <label for="manualImage">書影URL（任意）</label>
              <input id="manualImage" type="url" placeholder="https://..." value="${this.state.imageUrl || ''}" />
            </div>
          </div>
        </div>

        <div class="grid cols-2">
          <div>
            <label for="target">目標レビュー数</label>
            <input id="target" type="number" min="1" placeholder="100" value="${this.state.targetReviews || ''}" />
          </div>
          <div>
            <label for="stretch">ストレッチ目標（任意）</label>
            <input id="stretch" type="number" min="1" placeholder="200" value="${this.state.stretchGoal || ''}" />
          </div>
        </div>

        <div class="row">
          <button id="btnSave" class="btn primary">💾 保存</button>
          <button id="btnExport" class="btn">📤 エクスポート</button>
          <button id="btnImport" class="btn">📥 インポート</button>
          <input id="fileImport" class="hidden" type="file" accept=".json,application/json" />
          <button id="btnClear" class="btn danger">🗑️ データクリア</button>
          <a href="#progress" class="btn secondary">📊 進捗を見る</a>
        </div>
      </div>
    `;
    this.bind(root);
  }

  bind(root) {
    const $ = (id) => root.querySelector(id);
    $('#btnManual').addEventListener('click', () => {
      const box = $('#manual');
      box.classList.toggle('hidden');
    });
    $('#btnAutofill').addEventListener('click', () => this.autofill());
    $('#btnSave').addEventListener('click', () => this.save());
    $('#btnExport').addEventListener('click', () => this.export());
    $('#btnImport').addEventListener('click', () => $('#fileImport').click());
    $('#fileImport').addEventListener('change', async (e) => {
      try {
        if (!e.target.files?.length) return;
        const data = await this.storage.import(e.target.files[0]);
        toast.success(`インポートしました: ${data.title || 'タイトル未設定'}`);
        location.hash = '#progress';
      } catch (err) {
        toast.error(`インポートに失敗: ${err.message}`);
      } finally {
        e.target.value = '';
      }
    });
    $('#btnClear').addEventListener('click', async () => {
      const confirmed = await modal.confirm(
        'データ削除の確認',
        '保存されたデータを削除しますか？この操作は取り消せません。',
        { 
          confirmText: '削除する',
          cancelText: 'キャンセル',
          danger: true 
        }
      );
      if (confirmed) {
        this.storage.clear();
        toast.success('データを削除しました');
        this.render(root);
      }
    });
  }

  async autofill() {
    const root = document.getElementById('view-settings');
    const url = root.querySelector('#amazonUrl').value.trim();
    const btn = root.querySelector('#btnAutofill');
    if (!url) { 
      toast.warning('Amazon URLを入力してください');
      return; 
    }
    const v = this.validation.validateAmazonUrl(url);
    if (!v.isValid) { 
      toast.error(v.error);
      return; 
    }
    try {
      btn.disabled = true;
      btn.classList.add('loading');
      btn.textContent = '取得中...';
      const info = await this.fetcher.fetchBookInfo(v.url);
      root.querySelector('#manual').classList.remove('hidden');
      root.querySelector('#manualTitle').value = info.title || '';
      root.querySelector('#manualAuthor').value = info.author || '';
      root.querySelector('#manualReviews').value = info.reviewCount || 0;
      root.querySelector('#manualImage').value = info.imageUrl || '';
      this.state = { ...(this.state || {}), ...info, amazonUrl: v.url };
      if (info.isMockData) {
        toast.warning('Amazonからの取得に失敗しました', {
          title: '自動取得失敗',
          duration: 7000
        });
        toast.info('手動入力フォームを使用してください', {
          duration: 5000
        });
      } else {
        toast.success('書籍情報を取得しました', {
          title: '取得完了',
          duration: 4000
        });
      }
    } catch (e) {
      toast.error('取得に失敗しました。時間をおいて再試行してください。');
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.textContent = '自動取得';
    }
  }

  save() {
    const root = document.getElementById('view-settings');
    const q = (sel) => root.querySelector(sel);
    const amazonUrl = q('#amazonUrl').value.trim();
    const target = q('#target').value;
    const stretch = q('#stretch').value;
    const manualTitle = q('#manualTitle').value.trim();
    const manualAuthor = q('#manualAuthor').value.trim();
    const manualReviews = parseInt(q('#manualReviews').value || '0', 10) || 0;
    const manualImage = q('#manualImage').value.trim();

    if (amazonUrl) {
      const v = this.validation.validateAmazonUrl(amazonUrl);
      if (!v.isValid) { 
        toast.error(v.error);
        return; 
      }
    }
    const t = this.validation.validateTargetReviews(target);
    if (!t.isValid) { 
      toast.error(t.error);
      return; 
    }

    let title = manualTitle, author = manualAuthor;
    if (title && !this.validation.validateBookTitle(title).isValid) { 
      toast.error('タイトルを確認してください');
      return; 
    }
    if (author && !this.validation.validateAuthor(author).isValid) { 
      toast.error('著者名を確認してください');
      return; 
    }

    const prev = this.storage.load() || {};
    const data = {
      ...prev,
      title: title || prev.title || '',
      author: author || prev.author || '',
      reviewCount: manualReviews,
      imageUrl: manualImage || prev.imageUrl || '',
      targetReviews: t.value,
      stretchGoal: stretch ? parseInt(stretch, 10) : null,
      amazonUrl: amazonUrl || prev.amazonUrl || '',
      fetchedAt: prev.fetchedAt || null,
      savedAt: new Date().toISOString()
    };
    if (this.storage.save(data)) { 
      toast.success('設定を保存しました', {
        title: '保存完了'
      });
      this.state = data; 
    } else { 
      toast.error('保存に失敗しました');
    }
  }

  export() { 
    try { 
      this.storage.export();
      toast.success('データをエクスポートしました');
    } catch (e) { 
      toast.error(`エクスポートに失敗: ${e.message}`);
    } 
  }
}
