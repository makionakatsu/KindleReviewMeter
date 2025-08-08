export class ToastService {
  constructor() {
    this.container = null;
    this.toasts = [];
    this.init();
  }

  init() {
    // Create toast container
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    this.container.id = 'toast-container';
    document.body.appendChild(this.container);
  }

  show(message, type = 'info', options = {}) {
    const {
      title = this.getDefaultTitle(type),
      duration = 4000,
      closable = true
    } = options;

    const toast = this.createToast(message, type, title, closable);
    this.container.appendChild(toast);
    
    // Store reference
    this.toasts.push(toast);
    
    // Trigger entrance animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(toast);
      }, duration);
    }

    return toast;
  }

  createToast(message, type, title, closable) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = this.getIcon(type);
    
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">${icon}</div>
        <div class="toast-body">
          <div class="toast-title">${title}</div>
          <div class="toast-message">${message}</div>
        </div>
        ${closable ? '<button class="toast-close" aria-label="Close">×</button>' : ''}
      </div>
      <div class="toast-progress"></div>
    `;

    // Bind close button
    if (closable) {
      const closeBtn = toast.querySelector('.toast-close');
      closeBtn.addEventListener('click', () => this.dismiss(toast));
    }

    return toast;
  }

  dismiss(toast) {
    if (!toast || !toast.parentNode) return;

    // Remove from array
    const index = this.toasts.indexOf(toast);
    if (index > -1) {
      this.toasts.splice(index, 1);
    }

    // Animate out
    toast.classList.add('removing');
    
    // Remove from DOM after animation
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  dismissAll() {
    [...this.toasts].forEach(toast => this.dismiss(toast));
  }

  getDefaultTitle(type) {
    const titles = {
      success: '成功',
      error: 'エラー',
      warning: '警告',
      info: '情報'
    };
    return titles[type] || '通知';
  }

  getIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || 'ℹ';
  }

  // Convenience methods
  success(message, options = {}) {
    return this.show(message, 'success', options);
  }

  error(message, options = {}) {
    return this.show(message, 'error', options);
  }

  warning(message, options = {}) {
    return this.show(message, 'warning', options);
  }

  info(message, options = {}) {
    return this.show(message, 'info', options);
  }
}

// Global instance
export const toast = new ToastService();