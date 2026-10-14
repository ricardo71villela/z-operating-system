# Z Fashion staff sign-in

Passwordless sign-in for the Partner dashboard (`apps/fashion-partner/public/dashboard.html`) and the admin backoffice (`apps/fashion-admin/index.html`), same pattern as Z Studio: e-mail → 6-digit code → session.

- Never creates accounts (`shouldCreateUser: false`). Partner accounts come from onboarding; admin accounts are invited in Supabase (Authentication → Users).
- After sign-in the page calls the Partner API `GET /me` and unlocks only for an admin (backoffice) or a person managing at least one Partner (dashboard). This is a UI gate; the API authorizes every request on its own.
- Uses only the public Supabase URL and publishable key.

## Deploying a surface

1. Set `apiBaseUrl` in that surface's `zfashion-config.js`.
2. On the API: add the surface's origin to `FASHION_ALLOWED_ORIGINS`; for the backoffice, add admin user ids to `FASHION_ADMIN_USER_IDS`.

## Editing

`zfashion-auth.js` here is the source. After editing run `npm run sync` in this folder; `npm test` fails if a copy is stale.
