import { getRememberedReadingPath, initializeNavigationIcons } from './navigation.js';

initializeNavigationIcons();

const okumalarLink = document.querySelector('#appNavigation [data-route="okumalar"]');
if (okumalarLink) okumalarLink.href = getRememberedReadingPath();
