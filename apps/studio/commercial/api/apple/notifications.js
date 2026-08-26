import { loadAppleCommercialConfig } from '../../lib/config.js';
import {
  reconcileAppleNotificationToCommercialState,
} from '../../lib/apple-notification-reconciliation.js';
import {
  createAppleNotificationsHttpHandler,
} from '../../lib/apple-notification-http.js';

export default createAppleNotificationsHttpHandler({
  loadConfig: () => loadAppleCommercialConfig(process.env),
  reconcileNotification: reconcileAppleNotificationToCommercialState,
});
