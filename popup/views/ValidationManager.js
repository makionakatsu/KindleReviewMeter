/**
 * ValidationManager - Error display and simple validation helpers
 */
export class ValidationManager {
  constructor(elements, toast) {
    this.el = elements;
    this.toast = toast;
    this.errors = {};
  }

  setupRealtimeValidation() { /* no-op for now to preserve behavior */ }

  displayValidationErrors(errors = []) {
    errors.forEach(err => this.showFieldError(err.field, err.message));
    if (errors.length > 1) {
      this.toast?.error?.(`${errors.length}個のエラーがあります`);
    } else if (errors.length === 1) {
      this.toast?.error?.(errors[0].message);
    }
  }

  showFieldError(fieldName, message) {
    const input = this.el[fieldName];
    if (!input) return;
    input.classList.add('error');
    let msg = document.getElementById(`${fieldName}-error`);
    if (!msg) {
      msg = document.createElement('div');
      msg.id = `${fieldName}-error`;
      msg.className = 'field-error';
      input.parentNode?.appendChild(msg);
    }
    msg.textContent = message;
    msg.style.display = 'block';
    this.errors[fieldName] = message;
  }

  clearFieldError(fieldName) {
    const input = this.el[fieldName];
    if (input) input.classList.remove('error');
    const msg = document.getElementById(`${fieldName}-error`);
    if (msg) msg.style.display = 'none';
    delete this.errors[fieldName];
  }

  clearValidationErrors() {
    Object.keys(this.errors).forEach((k) => this.clearFieldError(k));
    this.errors = {};
  }

  validateField(/* fieldName */) { return { isValid: true, errors: [] }; }
}
