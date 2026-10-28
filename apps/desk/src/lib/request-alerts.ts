"use client";

/* Browser notifications for new marketplace requests (Z Desk Lite).
   Opt-in only: nothing is asked until the user clicks the button. */

export function deskNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestDeskNotifications(): Promise<'unsupported' | 'default' | 'granted' | 'denied'> {
  if (!deskNotificationsSupported()) return 'unsupported';
  try {
    return (await Notification.requestPermission()) as 'default' | 'granted' | 'denied';
  } catch {
    return Notification.permission as 'default' | 'granted' | 'denied';
  }
}

export function notifyNewRequests(count: number, title: string, body: string, href: string) {
  if (!deskNotificationsSupported() || Notification.permission !== 'granted' || count < 1) return;
  try {
    const notification = new Notification(count > 1 ? `${title} (${count})` : title, { body, tag: 'zdesk-requests' });
    notification.onclick = () => { window.focus(); window.location.assign(href); notification.close(); };
  } catch {
    /* Some browsers only allow notifications from a service worker: the badge still shows. */
  }
}
