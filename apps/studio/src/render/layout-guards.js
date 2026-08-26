// Z STUDIO — Renderer layout guards v1
// Stabilization module loaded after src/main.js. It deliberately overrides
// drawLogo() and drawGridTextBand() while the legacy renderer is progressively
// modularized. The helpers are also exposed to the Electron regression contract.
// ZSTUDIO_LAYOUT_GUARDS_V1

function measureSpacedTextWidth(ctx, txt, letterSpacing) {
  const chars = [...String(txt || '')];
  if (!chars.length) return 0;
  const widths = chars.map(ch => ctx.measureText(ch).width);
  return widths.reduce((a, b) => a + b, 0) + letterSpacing * Math.max(0, chars.length - 1);
}

function getLogoSafeLayout(ctx, requestedCx, requestedScale) {
  const t = I18N[state.lang] || I18N.pt;
  const text = t.poweredBy + ' MY STUDIO';
  const W = ctx.canvas.width;
  const baseMargin = Math.max(12, 16 * requestedScale);

  function dimensions(scale) {
    const previousFont = ctx.font;
    const fontSize = (brandLogoImg ? 13 : 15) * scale;
    const spacing = (brandLogoImg ? 4.5 : 6) * scale;
    ctx.font = `300 ${fontSize}px "DM Sans", sans-serif`;
    const textWidth = measureSpacedTextWidth(ctx, text, spacing);
    ctx.font = previousFont;

    let artWidth = 120 * scale;
    if (brandLogoImg && brandLogoImg.height) {
      const h = 92 * scale;
      artWidth = h * (brandLogoImg.width / brandLogoImg.height);
    }
    return { textWidth, artWidth, halfWidth: Math.max(textWidth, artWidth) / 2 };
  }

  let scale = requestedScale;
  let d = dimensions(scale);
  const available = Math.max(1, W - 2 * baseMargin);
  if (d.halfWidth * 2 > available) {
    scale *= available / (d.halfWidth * 2);
    d = dimensions(scale);
  }

  const margin = Math.max(12, 16 * scale);
  if (d.halfWidth * 2 + margin * 2 >= W) {
    return { cx: W / 2, scale, halfWidth: d.halfWidth, margin };
  }

  const minCx = d.halfWidth + margin;
  const maxCx = W - d.halfWidth - margin;
  const cx = Math.max(minCx, Math.min(maxCx, requestedCx));
  return { cx, scale, halfWidth: d.halfWidth, margin };
}

function drawLogo(ctx, cx, y, scale, color) {
  const t = I18N[state.lang] || I18N.pt;
  watermark(() => {
    const safe = getLogoSafeLayout(ctx, cx, scale);
    cx = safe.cx;
    scale = safe.scale;

    const gold = color || state.brand.accent || '#B8935A';
    ctx.textAlign = 'center';
    if (brandLogoImg) {
      const h = 92 * scale;
      const w = h * (brandLogoImg.width / brandLogoImg.height);
      const top = y - h * 0.66;
      ctx.drawImage(brandLogoImg, cx - w / 2, top, w, h);
      ctx.font = `300 ${13 * scale}px "DM Sans", sans-serif`;
      ctx.fillStyle = gold;
      spaced(ctx, t.poweredBy + ' MY STUDIO', cx, top + h + 22 * scale, 4.5 * scale);
      return;
    }

    ctx.fillStyle = gold;
    ctx.font = `500 ${86 * scale}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillText(brandInitial(), cx, y);
    ctx.strokeStyle = gold;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    ctx.moveTo(cx - 60 * scale, y + 14 * scale);
    ctx.lineTo(cx + 60 * scale, y + 14 * scale);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = `300 ${15 * scale}px "DM Sans", sans-serif`;
    ctx.fillStyle = gold;
    spaced(ctx, t.poweredBy + ' MY STUDIO', cx, y + 40 * scale, 6 * scale);
  });
}

function getGridTextBandLayout(ctx, W, H, gridH, FS, story) {
  const hasBadge = !!state.badge;
  const extraBand = (hasBadge ? (story ? 64 : 56) : 0) * FS;
  const bandTop = Math.max(0, gridH - extraBand);

  const badgeTop = bandTop + 18 * FS;
  const badgeHeight = 42 * FS;
  const badgeBottom = hasBadge ? badgeTop + badgeHeight : bandTop;

  const titleSize = fitText(
    ctx,
    state.title,
    W - 128 * FS,
    '500 SIZEpx "Cormorant Garamond", serif',
    34 * FS,
    54 * FS
  );

  let titleBaseline = bandTop + (hasBadge ? (story ? 130 : 120) : (story ? 98 : 84)) * FS;
  const minimumTitleTop = badgeBottom + 12 * FS;
  const estimatedAscent = titleSize * 0.92;
  if (titleBaseline - estimatedAscent < minimumTitleTop) {
    titleBaseline = minimumTitleTop + estimatedAscent;
  }

  const titleTop = titleBaseline - estimatedAscent;
  const locationY = titleBaseline + titleSize + 14 * FS;
  const footerY = H - 22 * FS;

  return {
    bandTop,
    badgeTop,
    badgeHeight,
    badgeBottom,
    titleSize,
    titleBaseline,
    titleTop,
    locationY,
    footerY,
    gap: titleTop - badgeBottom
  };
}

function drawGridTextBand(ctx, W, H, P, gridH, FS, story, locLine) {
  const layout = getGridTextBandLayout(ctx, W, H, gridH, FS, story);
  fillBg(ctx, W, H, P, layout.bandTop, H);
  ctx.strokeStyle = P.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, layout.bandTop);
  ctx.lineTo(W, layout.bandTop);
  ctx.stroke();

  if (state.badge) {
    ctx.font = `400 ${20 * FS}px "DM Sans", sans-serif`;
    const bw = ctx.measureText(state.badge.toUpperCase()).width + 40 * FS;
    ctx.fillStyle = P.badgeBg;
    ctx.fillRect(56 * FS, layout.badgeTop, bw, layout.badgeHeight);
    ctx.fillStyle = P.badgeInk;
    ctx.textAlign = 'left';
    ctx.fillText(state.badge.toUpperCase(), 56 * FS + 18 * FS, layout.badgeTop + 28 * FS);
  }

  let y = layout.titleBaseline;
  ctx.textAlign = 'left';
  ctx.fillStyle = P.ink;
  ctx.font = `500 ${layout.titleSize}px "Cormorant Garamond", serif`;
  wrapN(ctx, state.title, W - 128 * FS, 1).forEach(line => {
    ctx.fillText(line, 56 * FS, y);
    y += layout.titleSize + 4 * FS;
  });

  y += 10 * FS;
  ctx.fillStyle = P.muted;
  ctx.font = `300 ${22 * FS}px "DM Sans", sans-serif`;
  if (locLine) ctx.fillText('📍 ' + locLine, 56 * FS, y);

  ctx.textAlign = 'right';
  ctx.fillStyle = P.goldBig;
  ctx.font = `500 ${34 * FS}px "Cormorant Garamond", serif`;
  ctx.fillText(state.price, W - 56 * FS, y);
  ctx.textAlign = 'left';

  watermark(() => {
    ctx.fillStyle = P.faint;
    ctx.font = `300 ${17 * FS}px "DM Sans", sans-serif`;
    ctx.fillText(footerLine(), 56 * FS, layout.footerY);
  });
}
