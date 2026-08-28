/* ============================================================
   Z FIND — ZOS ECOSYSTEM FOOTER
   Keeps Z Find independent while exposing the wider ZOS family.
   Public destinations remain intentionally unset until each app's
   canonical public URL is validated.
   ============================================================ */

(function () {
  'use strict';

  const ZOS_APPS = [
    { key: 'studio', label: 'Z Studio', href: null },
    { key: 'fashion', label: 'Z Fashion', href: null },
    { key: 'desk', label: 'Z Desk', href: null },
    { key: 'jobs', label: 'Z Jobs', href: null },
    { key: 'mobility', label: 'Z Mobility', href: null },
  ];

  const STYLE_ID = 'zfind-zos-ecosystem-footer-style';
  const ROW_ID = 'zfind-zos-ecosystem-footer';

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      footer.site .cols {
        grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
      }

      #${ROW_ID} {
        border-top: 1px solid var(--gray-700);
        margin-top: 44px;
        padding-top: 20px;
        display: flex;
        justify-content: flex-end;
      }

      #${ROW_ID} .zos-ecosystem-links {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        flex-wrap: wrap;
      }

      #${ROW_ID} .zos-app-link {
        display: inline-flex;
        align-items: center;
        padding: 5px 0;
        color: var(--gray-400);
        font-size: 0.78rem;
        letter-spacing: 0.015em;
        line-height: 1.35;
        white-space: nowrap;
      }

      #${ROW_ID} .zos-app-link + .zos-app-link::before {
        content: "·";
        color: var(--gray-600);
        margin: 0 10px;
      }

      #${ROW_ID} a.zos-app-link:hover {
        color: #fff;
      }

      #${ROW_ID} .zos-app-link.is-pending {
        cursor: default;
      }

      #${ROW_ID} .zos-app-link.is-pending:hover {
        color: var(--gray-400);
      }

      footer.site .bottom {
        margin-top: 20px;
      }

      @media (max-width: 900px) {
        footer.site .cols {
          grid-template-columns: 1fr 1fr;
        }

        #${ROW_ID},
        #${ROW_ID} .zos-ecosystem-links {
          justify-content: flex-start;
        }
      }

      @media (max-width: 560px) {
        footer.site .cols {
          grid-template-columns: 1fr;
        }

        #${ROW_ID} .zos-ecosystem-links {
          row-gap: 2px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function createAppItem(app) {
    const node = document.createElement(app.href ? 'a' : 'span');
    node.className = 'zos-app-link' + (app.href ? '' : ' is-pending');
    node.dataset.zosApp = app.key;
    node.textContent = app.label;

    if (app.href) {
      node.href = app.href;
      node.target = '_blank';
      node.rel = 'noopener';
    } else {
      node.setAttribute('aria-disabled', 'true');
      node.dataset.linkState = 'pending';
    }

    return node;
  }

  function mount() {
    const footer = document.querySelector('footer.site .wrap');
    if (!footer || document.getElementById(ROW_ID)) return;

    const bottom = footer.querySelector('.bottom');
    if (!bottom) return;

    installStyles();

    const row = document.createElement('div');
    row.id = ROW_ID;
    row.className = 'zos-ecosystem-footer';

    const nav = document.createElement('nav');
    nav.className = 'zos-ecosystem-links';
    nav.setAttribute('aria-label', 'Z Operating System ecosystem');

    ZOS_APPS.forEach((app) => nav.appendChild(createAppItem(app)));
    row.appendChild(nav);
    footer.insertBefore(row, bottom);
  }

  window.ZFindZOSEcosystemFooter = Object.freeze({
    apps: ZOS_APPS.map((app) => Object.freeze({ ...app })),
    mount,
  });

  mount();
})();
