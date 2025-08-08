export class ModalService {
  constructor() {
    this.modals = [];
    this.init();
  }

  init() {
    // Create modal container if it doesn't exist
    if (!document.getElementById('modal-container')) {
      const container = document.createElement('div');
      container.id = 'modal-container';
      document.body.appendChild(container);
    }
  }

  confirm(message, options = {}) {
    const {
      title = '確認',
      confirmText = 'OK',
      cancelText = 'キャンセル',
      type = 'confirm'
    } = options;

    return new Promise((resolve) => {
      const modal = this.createConfirmModal(title, message, confirmText, cancelText, type);
      this.showModal(modal);

      // Handle confirm button
      modal.querySelector('.modal-confirm-btn').onclick = () => {
        this.hideModal(modal);
        resolve(true);
      };

      // Handle cancel button
      modal.querySelector('.modal-cancel-btn').onclick = () => {
        this.hideModal(modal);
        resolve(false);
      };

      // Handle close button
      modal.querySelector('.modal-close').onclick = () => {
        this.hideModal(modal);
        resolve(false);
      };

      // Handle overlay click
      modal.onclick = (e) => {
        if (e.target === modal) {
          this.hideModal(modal);
          resolve(false);
        }
      };

      // Handle ESC key
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          this.hideModal(modal);
          resolve(false);
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    });
  }

  createConfirmModal(title, message, confirmText, cancelText, type) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = `modal modal-${type}`;
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p>${message}</p>
      </div>
      <div class="modal-footer">
        <button class="btn secondary modal-cancel-btn">${cancelText}</button>
        <button class="btn danger modal-confirm-btn">${confirmText}</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    return overlay;
  }

  showModal(modalOverlay) {
    const container = document.getElementById('modal-container');
    container.appendChild(modalOverlay);
    this.modals.push(modalOverlay);
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    
    // Trigger animation
    requestAnimationFrame(() => {
      modalOverlay.classList.add('show');
    });
  }

  hideModal(modalOverlay) {
    modalOverlay.classList.remove('show');
    
    setTimeout(() => {
      if (modalOverlay.parentNode) {
        modalOverlay.parentNode.removeChild(modalOverlay);
      }
      
      // Remove from array
      const index = this.modals.indexOf(modalOverlay);
      if (index > -1) {
        this.modals.splice(index, 1);
      }
      
      // Restore body scroll if no modals left
      if (this.modals.length === 0) {
        document.body.style.overflow = '';
      }
    }, 250);
  }

  hideAll() {
    [...this.modals].forEach(modal => this.hideModal(modal));
  }
}

// Global instance
export const modal = new ModalService();