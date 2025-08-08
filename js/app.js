import { StorageService } from './services/StorageService.js';
import { ValidationService } from './services/ValidationService.js';
import { SettingsView } from './views/SettingsView.js';
import { ProgressView } from './views/ProgressView.js';
import { toast } from './utils/ToastService.js';
import { modal } from './utils/ModalService.js';

class App {
  constructor() {
    this.storage = new StorageService();
    this.validation = new ValidationService();
    this.views = {
      settings: new SettingsView(this.storage, this.validation),
      progress: new ProgressView(this.storage)
    };
    this.current = null;
  }

  async init() {
    this.bindTabs();
    this.bindShortcuts();
    window.addEventListener('hashchange', () => this.route());
    await this.route();
  }

  bindTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => t.addEventListener('click', () => setTimeout(() => this.highlightTab(), 0)));
  }

  highlightTab() {
    const hash = (location.hash || '#settings').replace('#','');
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    const active = document.getElementById(`tab-${hash}`);
    if (active) active.classList.add('active');
  }

  async route() {
    const hash = (location.hash || '#settings').replace('#','');
    this.highlightTab();
    const views = ['settings','progress'];
    views.forEach(v => document.getElementById(`view-${v}`).classList.remove('active'));
    const target = document.getElementById(`view-${hash}`) || document.getElementById('view-settings');
    target.classList.add('active');

    if (hash === 'progress') {
      await this.views.progress.render(target);
    } else {
      await this.views.settings.render(target);
    }
    this.current = hash;
  }

  bindShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        this.showHelp();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (this.current === 'progress') {
          this.views.progress.share();
        } else {
          this.views.settings.save();
        }
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        if (this.current === 'progress') {
          this.views.progress.refresh();
        } else {
          this.views.settings.autofill();
        }
      }
    });
  }

  async showHelp() {
    await modal.alert(
      '📚 Kindle Review Meter (SPA)',
      `
        <div style="line-height: 1.8;">
          <h4 style="margin: 0 0 1rem 0; color: var(--primary);">【使い方】</h4>
          <ol style="margin: 0 0 1rem 0; padding-left: 1.5rem;">
            <li>設定タブでAmazon URLを入力（まずは手動入力OK）</li>
            <li>目標を設定して保存</li>
            <li>進捗タブで表示・共有</li>
          </ol>
          <h4 style="margin: 1rem 0; color: var(--primary);">【ショートカット】</h4>
          <ul style="margin: 0; padding-left: 1.5rem; list-style: none;">
            <li><strong>Ctrl+S:</strong> 設定=保存 / 進捗=シェア</li>
            <li><strong>Ctrl+R:</strong> 設定=自動取得(後で) / 進捗=更新(後で)</li>
            <li><strong>F1:</strong> このヘルプ</li>
          </ul>
        </div>
      `,
      { confirmText: '了解' }
    );
  }
}

const app = new App();
app.init();

