export class ToastService {
  constructor() {
    this.container = null;
    this.toasts = new Map();
    this.toastId = 0;
    this.init();
  }

  init() {
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      console.error('Toast container not found');
    }
  }

  show(message, type = 'info', options = {}) {
    const {
      title = this.getDefaultTitle(type),
      duration = type === 'error' ? 8000 : 5000,
      closable = true,
      showProgress = true
    } = options;

    const toast = this.createToast(message, type, title, duration, closable, showProgress);
    this.container.appendChild(toast.element);
    
    // Trigger entrance animation
    requestAnimationFrame(() => {
      toast.element.classList.add('show');
    });

    // Auto dismiss
    if (duration > 0) {
      toast.timeoutId = setTimeout(() => {
        this.dismiss(toast.id);
      }, duration);

      // Progress bar animation
      if (showProgress) {
        const progressBar = toast.element.querySelector('.toast-progress');
        if (progressBar) {
          progressBar.style.width = '0%';
          progressBar.style.transitionDuration = `${duration}ms`;
        }
      }
    }

    return toast.id;
  }

  createToast(message, type, title, duration, closable, showProgress) {
    const id = ++this.toastId;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.dataset.toastId = id;

    const icon = this.getIcon(type);
    
    toast.innerHTML = `
      <div class="toast-header">
        <div style="display: flex; align-items: center; flex: 1;">
          <div class="toast-icon">${icon}</div>
          <h4 class="toast-title">${title}</h4>
        </div>
        ${closable ? '<button class="toast-close" aria-label="Close">×</button>' : ''}
      </div>
      ${message ? `<p class="toast-message">${message}</p>` : ''}
      ${showProgress ? '<div class="toast-progress"></div>' : ''}
    `;

    // Bind close button
    if (closable) {
      const closeBtn = toast.querySelector('.toast-close');
      closeBtn.addEventListener('click', () => this.dismiss(id));
    }

    // Store toast data
    const toastData = {
      id,
      element: toast,
      timeoutId: null
    };
    
    this.toasts.set(id, toastData);
    return toastData;
  }

  dismiss(id) {
    const toast = this.toasts.get(id);
    if (!toast) return;

    // Clear timeout
    if (toast.timeoutId) {
      clearTimeout(toast.timeoutId);
    }

    // Animate out
    toast.element.classList.add('removing');
    
    // Remove from DOM after animation
    setTimeout(() => {
      if (toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
      this.toasts.delete(id);
    }, 250);
  }

  dismissAll() {
    for (const [id] of this.toasts) {
      this.dismiss(id);
    }
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