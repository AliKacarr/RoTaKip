import { getRememberedGroup } from './navigation.js';
import { groupRoutePath } from './route-config.js';

const okumalarLink = document.querySelector('#appNavigation [data-route="okumalar"]');
if (okumalarLink) okumalarLink.href = groupRoutePath(getRememberedGroup());
