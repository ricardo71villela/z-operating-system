/**
 * D1/D2 security boundary: external provider writes are intentionally disabled.
 * D3 will re-enable this through the encrypted credential + verified OAuth authority.
 */
export async function pushConfirmedEventToExternalCalendars(_eventId: string, _workspaceId: string) {
  return;
}
