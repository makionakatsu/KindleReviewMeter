import { BookInfoService } from '../services/BookInfoService.js';
import { toast } from '../utils/ToastService.js';

export class ProgressView {
  constructor(storage) { this.storage = storage; this.fetcher = new BookInfoService(); }

  async render(root) {
    const data = this.storage.load();
    if (!data) {
      root.innerHTML = `
        <div class="card center">
          <p>📝 データが設定されていません。</p>
          <a href="#settings" class="btn primary">設定へ</a>
        </div>`;
      return;
    }
    const p = this.calc(data);
    const msg = p.achieved ? '🎉 目標達成！' : (p.percentage>=80?'🔥 もうすぐ達成！':(p.percentage>=50?'📈 順調です':'💪 がんばりましょう'));
    root.innerHTML = `
      <div class="card grid interactive">
        <div class="book">
          <img src="${data.imageUrl || 'data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"150\"><rect width=\"100\" height=\"150\" fill=\"%23eef0f6\"/><text x=\"50\" y=\"80\" text-anchor=\"middle\" font-family=\"Arial\" font-size=\"12\" fill=\"%23999\">No Image</text></svg>'}" alt="書影" />
          <div>
            <h2>${data.title || 'タイトル未設定'}</h2>
            <p><strong>著者:</strong> ${data.author || '未設定'}</p>
            <p><strong>目標:</strong> ${data.targetReviews || 0}${data.stretchGoal?` / <strong>ストレッチ:</strong> ${data.stretchGoal}`:''}</p>
          </div>
        </div>
        <div>
          <div class="progress"><div class="fill" style="width:${p.percentage}%"></div><div class="text">${p.percentage}%</div></div>
          <div class="stats">
            <div class="stat stagger-item"><div class="value">${p.current}</div><div class="label">現在</div></div>
            <div class="stat stagger-item"><div class="value">${p.target}</div><div class="label">目標</div></div>
            <div class="stat stagger-item"><div class="value">${p.remaining}</div><div class="label">あと</div></div>
          </div>
          <p class="center">${msg}</p>
        </div>
        <div class="actions">
          <button id="btnShare" class="btn">📤 シェア</button>
          <button id="btnRefresh" class="btn">🔄 更新</button>
          <a href="#settings" class="btn secondary">⚙️ 設定へ</a>
        </div>
      </div>`;
    this.bind(root);
  }

  bind(root){
    root.querySelector('#btnShare').addEventListener('click', () => this.share());
    root.querySelector('#btnRefresh').addEventListener('click', () => this.refresh());
  }
  calc(d){
    const current = d.reviewCount||0, target=d.targetReviews||1;
    const percentage = Math.min(Math.round((current/target)*100), 100);
    const remaining = Math.max(target-current, 0);
    return { current, target, remaining, percentage, achieved: current>=target };
  }
  share(){
    const d = this.storage.load(); if(!d) return; const p=this.calc(d);
    const text = `📚 ${d.title||''} 進捗: ${p.current}/${p.target} (${p.percentage}%)`;
    const url = location.origin + location.pathname + '#progress';
    if (navigator.share) {
      try {
        await navigator.share({title:'Kindle Review Meter', text, url});
        toast.success('シェアしました');
      } catch (err) {
        if (err.name !== 'AbortError') {
          this.fallbackShare(text, url);
        }
      }
    } else {
      this.fallbackShare(text, url);
    }
  }
  fallbackShare(text, url) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`${text} ${url}`)
        .then(() => toast.success('シェア用テキストをクリップボードにコピーしました'))
        .catch(() => {
          toast.info(`${text} ${url}`, {
            title: 'シェア用テキスト',
            duration: 10000
          });
        });
    } else {
      toast.info(`${text} ${url}`, {
        title: 'シェア用テキスト',
        duration: 10000
      });
    }
  }
  
  async refresh(){
    const data = this.storage.load();
    if (!data || !data.amazonUrl) { 
      toast.warning('更新に必要なAmazon URLが保存されていません', {
        title: 'URLが未設定',
        duration: 6000
      });
      toast.info('設定タブでAmazon URLを保存してください');
      return; 
    }
    const root = document.getElementById('view-progress');
    const btn = root.querySelector('#btnRefresh');
    try{
      btn.disabled = true;
      btn.classList.add('loading');
      btn.textContent = '更新中...';
      const latest = await this.fetcher.fetchBookInfo(data.amazonUrl);
      const merged = { ...data, ...latest, amazonUrl: data.amazonUrl, savedAt: new Date().toISOString() };
      this.storage.save(merged);
      await this.render(root);
      if (latest.isMockData) {
        toast.warning('更新に失敗しました', {
          title: 'データ更新失敗',
          duration: 7000
        });
        toast.info('設定タブの手動入力でデータを更新してください');
      } else {
        toast.success('最新データを取得しました', {
          title: '更新完了'
        });
      }
    }catch(e){
      toast.error('更新に失敗しました。時間をおいて再試行してください。');
    }finally{
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.textContent = '🔄 更新';
    }
  }
}
