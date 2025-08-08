export class ModalService {
  constructor() {
    this.activeModal = null;
    this.init();
  }

  init() {
    // Create modal root if it doesn't exist
    if (!document.getElementById('modal-root')) {
      const modalRoot = document.createElement('div');
      modalRoot.id = 'modal-root';
      modalRoot.className = 'modal-root';
      document.body.appendChild(modalRoot);
    }

    // Handle escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.close();
      }
    });
  }

  async confirm(title, message, options = {}) {
    return new Promise((resolve) => {
      const {
        confirmText = 'OK',
        cancelText = 'キャンセル',
        type = 'confirm',
        danger = false
      } = options;

      const modal = this.createModal(title, message, [
        {
          text: cancelText,
          action: () => {
            this.close();
            resolve(false);
          },
          secondary: true
        },
        {
          text: confirmText,
          action: () => {
            this.close();
            resolve(true);
          },
          primary: true,
          danger
        }
      ]);

      this.show(modal);
    });
  }

  async prompt(title, message, options = {}) {
    return new Promise((resolve) => {
      const {
        defaultValue = '',
        placeholder = '',
        confirmText = 'OK',
        cancelText = 'キャンセル',
        inputType = 'text'
      } = options;

      let inputValue = defaultValue;

      const inputHTML = `
        <div class="modal-input-group">
          <input 
            type="${inputType}" 
            class="modal-input" 
            value="${defaultValue}"
            placeholder="${placeholder}"
            autofocus
          />
        </div>
      `;

      const modal = this.createModal(title, message + inputHTML, [
        {
          text: cancelText,
          action: () => {
            this.close();
            resolve(null);
          },
          secondary: true
        },
        {
          text: confirmText,
          action: () => {
            const input = modal.querySelector('.modal-input');
            const value = input ? input.value.trim() : '';
            this.close();
            resolve(value || null);
          },
          primary: true
        }
      ]);

      // Handle input changes
      const input = modal.querySelector('.modal-input');
      if (input) {
        input.addEventListener('input', (e) => {
          inputValue = e.target.value;
        });
        
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            this.close();
            resolve(inputValue.trim() || null);
          }
        });
      }

      this.show(modal);
    });
  }

  alert(title, message, options = {}) {
    return new Promise((resolve) => {
      const { confirmText = 'OK', type = 'info' } = options;

      const modal = this.createModal(title, message, [
        {
          text: confirmText,
          action: () => {
            this.close();
            resolve(true);
          },
          primary: true
        }
      ]);

      this.show(modal);
    });
  }

  createModal(title, content, actions = []) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-container">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" aria-label="Close">×</button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        <div class="modal-footer">
          ${actions.map(action => `
            <button class="btn ${action.primary ? 'primary' : 'secondary'} ${action.danger ? 'danger' : ''}" 
                    data-action="${actions.indexOf(action)}">
              ${action.text}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    // Bind action buttons
    actions.forEach((action, index) => {
      const button = modal.querySelector(`[data-action="${index}"]`);
      if (button && action.action) {
        button.addEventListener('click', action.action);
      }
    });

    // Bind close button
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => this.close());

    // Bind backdrop click
    const backdrop = modal.querySelector('.modal-backdrop');
    backdrop.addEventListener('click', () => this.close());

    return modal;
  }

  show(modal) {
    if (this.activeModal) {
      this.close();
    }

    const modalRoot = document.getElementById('modal-root');
    modalRoot.appendChild(modal);
    this.activeModal = modal;

    // Add body class to prevent scrolling
    document.body.classList.add('modal-open');

    // Trigger entrance animation
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });

    // Focus management
    const firstFocusable = modal.querySelector('input, button');
    if (firstFocusable) {
      firstFocusable.focus();
    }
  }

  close() {
    if (!this.activeModal) return;

    // Animate out
    this.activeModal.classList.add('hiding');
    
    setTimeout(() => {
      if (this.activeModal && this.activeModal.parentNode) {
        this.activeModal.parentNode.removeChild(this.activeModal);
      }
      this.activeModal = null;
      document.body.classList.remove('modal-open');
    }, 250);
  }
}

// Global instance
export const modal = new ModalService();