/**
 * Global test hook: the project store persists to localStorage, so wipe its
 * keys before every spec to keep tests independent of each other and of
 * whatever a developer has saved in the test browser.
 */
beforeEach(() => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('hit-enclosure:')) localStorage.removeItem(key);
    }
    sessionStorage.removeItem('easy-enclosure:session-params');
  } catch {
    // storage unavailable - nothing to clean
  }
});
