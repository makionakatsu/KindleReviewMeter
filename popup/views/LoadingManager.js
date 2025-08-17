/**
 * LoadingManager - Manage loading states and indicators
 */
export class LoadingManager {
  constructor(elements) {
    this.el = elements;
  }

  setLoading(loading, message = 'Loading...') {
    const names = ['amazonUrl','title','author','imageUrl','reviewCount','targetReviews','associateTag','associateEnabled'];
    names.forEach(n => { if (this.el[n]) this.el[n].disabled = !!loading; });
    if (loading) this.showLoadingIndicator(message); else this.hideLoadingIndicator();
  }

  setButtonLoading(buttonName, loading, loadingText = 'Loading...') {
    const btn = this.el[buttonName];
    if (!btn) return;
    if (loading) {
      if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent || '';
      btn.textContent = loadingText;
      btn.disabled = true;
      btn.classList.add('loading');
    } else {
      btn.textContent = btn.dataset.originalText || btn.textContent;
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }

  showLoadingIndicator(message) {
    let indicator = document.getElementById('loading-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'loading-indicator';
      indicator.className = 'loading-indicator';
      document.body.appendChild(indicator);
    }
    indicator.innerHTML = `
      <div class="loading-content">
        <div class="spinner"></div>
        <div class="loading-message">${message}</div>
      </div>`;
    indicator.style.display = 'flex';
  }

  hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) indicator.style.display = 'none';
  }
}
