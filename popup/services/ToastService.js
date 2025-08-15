/**
 * ToastService - Simple toast notifications
 */
export default class ToastService {
  constructor() {
    this.container = document.getElementById('toast-container');
  }

  ensureContainer() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  }

  show(message, type = 'info', options = {}) {
    this.ensureContainer();
    const { title = this.titleFor(type), duration = 4000, closable = true } = options;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">${this.iconFor(type)}</div>
        <div class="toast-body">
          <div class="toast-title">${title}</div>
          <div class="toast-message">${message}</div>
        </div>
        ${closable ? '<button class="toast-close" aria-label="Close">×</button>' : ''}
      </div>`;
    if (closable) {
      toast.querySelector('.toast-close')?.addEventListener('click', () => toast.remove());
    }
    this.container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    if (duration > 0) setTimeout(() => toast.remove(), duration);
    return toast;
  }

  success(m, o = {}) { return this.show(m, 'success', o); }
  error(m, o = {}) { return this.show(m, 'error', o); }
  warning(m, o = {}) { return this.show(m, 'warning', o); }
  info(m, o = {}) { return this.show(m, 'info', o); }

  titleFor(type) {
    return ({ success: '成功', error: 'エラー', warning: '警告', info: '情報' }[type] || '通知');
  }
  iconFor(type) {
    return ({ success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }[type] || 'ℹ');
  }
}

