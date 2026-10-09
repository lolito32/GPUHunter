'use strict';

import { checkAppUpdate } from './js/ui.js';
import { setupEvents } from './js/events.js';
import { state } from './js/state.js';

function init() {
  setupEvents();
  checkAppUpdate(state);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
