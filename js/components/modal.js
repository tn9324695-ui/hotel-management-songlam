(function (root) {
  'use strict';
  const focus = new WeakMap();
  root.SongLamComponents.modal = Object.freeze({
    open(dialog) {
      if (dialog.open) return;
      focus.set(dialog, document.activeElement); dialog.showModal();
      dialog.addEventListener('close', () => { focus.get(dialog)?.focus?.(); focus.delete(dialog); }, { once: true });
    },
    close(dialog) { dialog.close(); }
  });
}(window));
