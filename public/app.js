'use strict';
import { setupEvents, maybeShowOnboarding, boot } from './js/events/events.js';

setupEvents();
maybeShowOnboarding();
boot();
