'use strict';

const express = require('express');

const { publicPath } = require('./config/env');

const { initializeDatabaseIndexes } = require('./config/database-indexes');
const { isDatabaseConnected } = require('./config/database');
const { configureSession } = require('./config/session');
const dropboxService = require('./integrations/dropbox/dropbox.service');
const { registerDropboxRoutes } = require('./integrations/dropbox/dropbox.routes');
const erpService = require('./integrations/erp/erp-readings-sync');
const oneSignalService = require('./integrations/onesignal/onesignal.service');
const {
  configureCoreMiddleware,
  configureStaticFiles
} = require('./middleware/http');
const rateLimiters = require('./middleware/rate-limits');
const { uploadErrorHandler } = require('./middleware/upload-error');
const { createUploadMiddleware } = require('./middleware/uploads');
const activityModels = require('./modules/activity/activity.models');
const { registerActivityRoutes } = require('./modules/activity/activity.routes');
const { createActivityService } = require('./modules/activity/activity.service');
const { createAuthMiddleware } = require('./modules/auth/auth.middleware');
const { registerAdminAuthRoutes } = require('./modules/auth/admin-auth.routes');
const { registerAuthRoutes } = require('./modules/auth/auth.routes');
const { handleLoginStreak } = require('./modules/auth/login-streak.service');
const { registerContentRoutes } = require('./modules/content/content.routes');
const groupModels = require('./modules/groups/group.models');
const groupService = require('./modules/groups/group.service');
const groupSettings = require('./modules/groups/group-settings');
const inactiveMemberPolicy = require('./modules/groups/inactive-member-policy');
const { registerGroupRoutes } = require('./modules/groups/group.routes');
const invitationModel = require('./modules/invitations/invitation.models');
const { registerInvitationRoutes } = require('./modules/invitations/invitation.routes');
const inspirationModels = require('./modules/inspiration/inspiration.models');
const inspirationService = require('./modules/inspiration/inspiration.service');
const { registerInspirationRoutes } = require('./modules/inspiration/inspiration.routes');
const { registerTefekkurRoutes } = require('./modules/inspiration/tefekkur.routes');
const { createTefekkurService } = require('./modules/inspiration/tefekkur.service');
const joinRequestClaims = require('./modules/join-requests/join-request.claims');
const joinRequestModel = require('./modules/join-requests/join-request.models');
const { registerJoinRequestRoutes } = require('./modules/join-requests/join-request.routes');
const {
  registerProtectedPageRoutes,
  registerPublicPageRoutes
} = require('./modules/pages/page.routes');
const readingEditPolicy = require('./modules/readings/reading-edit-policy');
const { registerReadingRoutes } = require('./modules/readings/reading.routes');
const { registerHealthRoutes } = require('./modules/system/health.routes');
const { createReverseGeocoder } = require('./integrations/geocoding/reverse-geocoder');
const { registerTesbihatRoutes } =require('./modules/tesbihat/tesbihat.routes');
const { createTesbihatService } = require('./modules/tesbihat/tesbihat.service');
const { registerProfileRoutes } = require('./modules/users/profile.routes');
const userService = require('./modules/users/user.service');
const userVisibility = require('./modules/users/user-visibility');
const { registerUserRoutes } = require('./modules/users/user.routes');
const dateTime = require('./shared/date-time');
const { isSafeGroupId } = require('./shared/group-id');
const validation = require('./shared/validation');

const app = express();
const SITE_ACTIVITY_ADMIN_GROUP_ID = process.env.SITE_ACTIVITY_ADMIN_GROUP_ID || 'catikati23';
if (!isSafeGroupId(SITE_ACTIVITY_ADMIN_GROUP_ID)) {
  throw new Error('SITE_ACTIVITY_ADMIN_GROUP_ID geçerli bir grup kimliği olmalıdır');
}
const ERP_SKO_GROUP_SET = new Set(erpService.ERP_SKO_GROUPS);

configureCoreMiddleware(app);

const sessionConfig = configureSession(app);
const uploadMiddleware = createUploadMiddleware({
  unlinkWithRetry: dropboxService.unlinkWithRetry
});
const authMiddleware = createAuthMiddleware({
  JoinRequest: joinRequestModel.JoinRequest,
  SITE_ACTIVITY_ADMIN_GROUP_ID,
  UserGroup: groupModels.UserGroup,
  getAuthGroupId: validation.getAuthGroupId,
  getGroupCollections: groupModels.getGroupCollections,
  isActiveUser: userVisibility.isActiveUser,
  isSafeGroupId
});
const activityService = createActivityService({
  getSessionMembership: authMiddleware.getSessionMembership
});
const tesbihatService = createTesbihatService({ reverseGeocode: createReverseGeocoder() });
const tefekkurService = createTefekkurService({ models: inspirationModels, publicPath });

const routeDependencies = {
  ...activityModels,
  ...activityService,
  ...authMiddleware,
  ...dateTime,
  ...dropboxService,
  ...groupModels,
  ...groupService,
  ...groupSettings,
  ...inactiveMemberPolicy,
  ...invitationModel,
  ...inspirationModels,
  ...joinRequestClaims,
  ...joinRequestModel,
  ...rateLimiters,
  ...readingEditPolicy,
  ...tefekkurService,
  ...tesbihatService,
  ...uploadMiddleware,
  ...userService,
  ...userVisibility,
  ...validation,
  ERP_SKO_GROUP_SET,
  SITE_ACTIVITY_ADMIN_GROUP_ID,
  getErpReadingsChangeVersion: erpService.getErpReadingsChangeVersion,
  handleLoginStreak,
  isProduction: sessionConfig.isProduction,
  isSafeGroupId,
  publicPath,
  sessionCookieName: sessionConfig.cookieName,
  syncErpReadingsOnDemand: erpService.syncErpReadingsOnDemand
};

registerProtectedPageRoutes(app, routeDependencies);
configureStaticFiles(app, publicPath);
registerPublicPageRoutes(app, routeDependencies);
registerContentRoutes(app);
registerTesbihatRoutes(app, routeDependencies);
registerDropboxRoutes(app, routeDependencies);
registerGroupRoutes(app, routeDependencies);
registerAuthRoutes(app, routeDependencies);
registerUserRoutes(app, routeDependencies);
registerReadingRoutes(app, routeDependencies);
registerInvitationRoutes(app, routeDependencies);
registerAdminAuthRoutes(app, routeDependencies);
registerActivityRoutes(app, routeDependencies);
registerInspirationRoutes(app, routeDependencies);
registerTefekkurRoutes(app, routeDependencies);
registerJoinRequestRoutes(app, routeDependencies);
registerHealthRoutes(app, { isDatabaseConnected });
registerProfileRoutes(app, routeDependencies);

app.use(uploadErrorHandler);

let appResourcesClosePromise = null;

function closeAppResources() {
  if (appResourcesClosePromise) return appResourcesClosePromise;

  appResourcesClosePromise = (async () => {
    let initializationError = null;

    // connect-mongo creates its TTL index asynchronously. Closing its client
    // before that work settles can leave an operation using an ended session.
    if (sessionConfig.store.collectionP) {
      try {
        await sessionConfig.store.collectionP;
      } catch (error) {
        initializationError = error;
      }
    }

    if (typeof sessionConfig.store.close === 'function') {
      await sessionConfig.store.close();
    }

    if (initializationError) throw initializationError;
  })();

  return appResourcesClosePromise;
}

module.exports = {
  app,
  closeAppResources,
  getRandomVecizeForPush: inspirationService.getRandomVecizeForPush,
  initializeDatabaseIndexes,
  initializeDropbox: dropboxService.initializeDropbox,
  refreshDropboxToken: dropboxService.refreshDropboxToken,
  sendOneSignalNotification: oneSignalService.sendOneSignalNotification
};
