/* Each plan owns its progress. Keep the legacy list untouched for migration. */
window.EEProgress = {
  load(plan, cards) {
    try {
      const key = `ee_completed_courses:${plan}`;
      const stored = localStorage.getItem(key);
      const ids = JSON.parse(stored ?? localStorage.getItem('ee_completed_courses') ?? '[]');
      if (!Array.isArray(ids)) return;
      const completed = new Set(ids.filter(id => typeof id === 'string'));
      const matching = [];
      for (const card of cards) {
        if (completed.has(card.id)) {
          card.classList.add('completed');
          matching.push(card.id);
        }
      }
      if (stored === null) localStorage.setItem(key, JSON.stringify(matching));
    } catch (error) {
      console.warn('Course progress could not be restored.', error);
    }
  },
  save(plan, cards) {
    try {
      const ids = Array.from(cards)
        .filter(card => card.classList.contains('completed'))
        .map(card => card.id);
      localStorage.setItem(`ee_completed_courses:${plan}`, JSON.stringify(ids));
    } catch (error) {
      console.warn('Course progress could not be saved.', error);
    }
  }
};
