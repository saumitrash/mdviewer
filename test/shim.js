/* Minimal chrome.* shim so src/viewer.js can run as a plain page for visual QA. */
window.chrome = {
  runtime: {
    getURL: (p) => '../' + p,
    sendMessage: async () => ({ ok: true }),
    onMessage: { addListener() {} }
  },
  storage: {
    sync: {
      get: async (defaults) => {
        const stored = JSON.parse(localStorage.getItem('mdv') || '{}');
        return { ...defaults, ...stored };
      },
      set: async (patch) => {
        const stored = JSON.parse(localStorage.getItem('mdv') || '{}');
        localStorage.setItem('mdv', JSON.stringify({ ...stored, ...patch }));
      }
    }
  }
};
