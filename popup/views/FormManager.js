/**
 * FormManager - Manage form data read/write for popup UI
 * Notes: Kept minimal and behavior-compatible with prior UIManager logic.
 */
export class FormManager {
  constructor(elements) {
    this.el = elements;
  }

  getFormData() {
    const e = this.el;
    const val = (x) => (x && typeof x.value === 'string') ? x.value.trim() : '';
    const num = (x) => {
      const v = val(x);
      return v === '' ? NaN : Number(v);
    };
    const currentReviews = Number.isFinite(num(e.reviewCount)) ? Number(num(e.reviewCount)) : 0;
    const targetRaw = num(e.targetReviews);
    const targetReviews = Number.isFinite(targetRaw) && targetRaw > 0 ? Number(targetRaw) : null;
    return {
      title: val(e.title),
      author: val(e.author),
      imageUrl: val(e.imageUrl),
      amazonUrl: val(e.amazonUrl),
      currentReviews,
      targetReviews,
      associateTag: val(e.associateTag),
      associateEnabled: !!(e.associateEnabled?.checked)
    };
  }

  setFormData(data) {
    const e = this.el;
    const set = (el, v) => { if (el) el.value = (v ?? '').toString(); };
    set(e.amazonUrl, data.amazonUrl || '');
    set(e.title, data.title || '');
    set(e.author, data.author || '');
    set(e.imageUrl, data.imageUrl || '');
    set(e.reviewCount, (data.currentReviews ?? 0));
    set(e.targetReviews, data.targetReviews ?? '');
    set(e.associateTag, data.associateTag || '');
    if (e.associateEnabled) {
      const enabled = (data.associateEnabled !== undefined) ? !!data.associateEnabled : true;
      e.associateEnabled.checked = enabled;
    }
  }

  clearForm() {
    this.setFormData({
      amazonUrl: '',
      title: '',
      author: '',
      imageUrl: '',
      currentReviews: 0,
      targetReviews: null,
      associateTag: '',
      associateEnabled: true
    });
  }
}
