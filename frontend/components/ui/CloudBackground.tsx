"use client";

import { useEffect, useRef } from "react";

/**
 * Decorative drifting-cloud background (three parallax layers + faint
 * twinkling sparks), ported from the Home v3 design source's bubbleRef
 * canvas. Sizes itself to its own positioned parent via ResizeObserver, so
 * any page can drop it in as the first child of a `relative` wrapper with
 * the real content given `relative z-[1]` to sit above it.
 *
 * `bankRef`, if given, draws one extra wide, slow-drifting cloud bank
 * centered at that element's top offset -- used on the homepage to mark the
 * boundary between sections. Most pages should omit it.
 */
export function CloudBackground({ bankRef }: { bankRef?: React.RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const parent = cv?.parentElement;
    if (!cv || !parent) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const DPR = window.devicePixelRatio || 1;
    let W = 0;
    let H = 0;
    let bankY = 0;
    let raf = 0;
    let t = 0;

    type Cloud = {
      layer: number;
      puffs: { dx: number; dy: number; r: number; ph: number }[];
      scale: number;
      x: number;
      y: number;
      sp: number;
      a: number;
      breathe: number;
    };

    const mkCloud = (layer: number, xStart?: number): Cloud => {
      const scale = (0.55 + layer * 0.45) * (0.8 + Math.random() * 0.5);
      const puffs = [];
      const n = 6 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        puffs.push({
          dx: Math.cos(a) * (30 + Math.random() * 70),
          dy: Math.sin(a) * (10 + Math.random() * 22) - Math.random() * 14,
          r: 28 + Math.random() * 42,
          ph: Math.random() * Math.PI * 2,
        });
      }
      puffs.push({ dx: 0, dy: -8, r: 52 + Math.random() * 30, ph: Math.random() * Math.PI * 2 });
      return {
        layer,
        puffs,
        scale,
        x: xStart !== undefined ? xStart : W + 220 * DPR * scale,
        y: H * (0.18 + layer * 0.26 + Math.random() * 0.18),
        sp: (0.12 + layer * 0.16 + Math.random() * 0.08) * DPR,
        a: 0.32 + layer * 0.14 + Math.random() * 0.1,
        breathe: Math.random() * Math.PI * 2,
      };
    };

    let clouds: Cloud[] = [];
    const bank: { fx: number; dy: number; r: number; ph: number; a: number }[] = [];
    const sparks: { x: number; y: number; s: number; ph: number; sp: number }[] = [];

    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

    const resize = () => {
      const r = parent.getBoundingClientRect();
      // The canvas breaks out to full viewport width (see className below)
      // regardless of how narrow its positioned ancestor is, so the pixel
      // buffer must match the viewport, not the parent's own width.
      W = cv.width = document.documentElement.clientWidth * DPR;
      H = cv.height = r.height * DPR;
      bankY = (bankRef?.current ? bankRef.current.offsetTop : -1) * DPR;
      if (clouds.length === 0) {
        for (let l = 0; l < 3; l++) for (let i = 0; i < 5; i++) clouds.push(mkCloud(l, Math.random() * W));
        if (bankRef) {
          for (let i = 0; i < 16; i++) {
            bank.push({
              fx: i / 15 + (Math.random() - 0.5) * 0.05,
              dy: (Math.random() - 0.5) * 60,
              r: 70 + Math.random() * 90,
              ph: Math.random() * Math.PI * 2,
              a: 0.32 + Math.random() * 0.2,
            });
          }
        }
        for (let i = 0; i < 40; i++) {
          sparks.push({ x: Math.random(), y: Math.random(), s: (0.7 + Math.random() * 1.3) * DPR, ph: Math.random() * Math.PI * 2, sp: 0.5 + Math.random() * 1.1 });
        }
      }
    };
    resize();

    const onMove = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) / (r.width || 1);
      mouse.ty = (e.clientY - r.top) / (r.height || 1);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("resize", resize, { passive: true });

    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const tick = () => {
      t += 0.016;
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      ctx.clearRect(0, 0, W, H);

      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "rgba(126,168,224,.62)");
      sky.addColorStop(0.5, "rgba(160,196,238,.34)");
      sky.addColorStop(1, "rgba(200,220,240,.08)");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      const blush = ctx.createRadialGradient(W * 0.12, H * 0.95, 0, W * 0.12, H * 0.95, W * 0.55);
      blush.addColorStop(0, "rgba(235,190,215,.16)");
      blush.addColorStop(1, "rgba(235,190,215,0)");
      ctx.fillStyle = blush;
      ctx.fillRect(0, 0, W, H);

      clouds.sort((a, b) => a.layer - b.layer);
      for (const c of clouds) {
        c.breathe += 0.006;
        c.x -= c.sp * (1 + (mouse.x - 0.5) * 0.8);
        const px = (mouse.x - 0.5) * (c.layer + 1) * -26 * DPR;
        const py = (mouse.y - 0.5) * (c.layer + 1) * -12 * DPR;
        const extent = 160 * c.scale * DPR;
        if (c.x < -extent) Object.assign(c, mkCloud(c.layer));
        const breathe = 1 + Math.sin(c.breathe) * 0.045;
        for (const p of c.puffs) {
          const r = p.r * c.scale * DPR * breathe * (1 + Math.sin(t * 0.4 + p.ph) * 0.05);
          const x = c.x + p.dx * c.scale * DPR + px;
          const y = c.y + p.dy * c.scale * DPR + py + Math.sin(t * 0.3 + p.ph) * 3 * DPR;
          const g = ctx.createRadialGradient(x, y - r * 0.25, r * 0.1, x, y, r);
          g.addColorStop(0, `rgba(255,255,255,${c.a})`);
          g.addColorStop(0.55, `rgba(250,250,252,${c.a * 0.75})`);
          g.addColorStop(0.8, `rgba(225,228,238,${c.a * 0.35})`);
          g.addColorStop(1, "rgba(215,220,235,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (bankY > 0) {
        const driftX = (t * 6 * DPR) % (W * 0.12);
        for (const b of bank) {
          const r = b.r * DPR * (1 + Math.sin(t * 0.35 + b.ph) * 0.05);
          const x = ((b.fx * W + driftX) % (W + 2 * r)) - r;
          const y = bankY + (b.dy + Math.sin(t * 0.25 + b.ph) * 8) * DPR;
          const g = ctx.createRadialGradient(x, y - r * 0.3, r * 0.08, x, y, r);
          g.addColorStop(0, `rgba(255,255,255,${b.a})`);
          g.addColorStop(0.55, `rgba(252,252,254,${b.a * 0.8})`);
          g.addColorStop(0.82, `rgba(228,232,242,${b.a * 0.35})`);
          g.addColorStop(1, "rgba(218,224,238,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const s of sparks) {
        const tw = (Math.sin(t * s.sp * 2 + s.ph) + 1) / 2;
        if (tw < 0.45) continue;
        const x = s.x * W;
        const y = s.y * H;
        const r = s.s * tw;
        ctx.fillStyle = `rgba(255,255,255,${0.4 * tw})`;
        ctx.beginPath();
        ctx.moveTo(x, y - r * 2.4);
        ctx.quadraticCurveTo(x + r * 0.5, y - r * 0.5, x + r * 2.4, y);
        ctx.quadraticCurveTo(x + r * 0.5, y + r * 0.5, x, y + r * 2.4);
        ctx.quadraticCurveTo(x - r * 0.5, y + r * 0.5, x - r * 2.4, y);
        ctx.quadraticCurveTo(x - r * 0.5, y - r * 0.5, x, y - r * 2.4);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // Breaks out to the full viewport width regardless of how narrow the
      // positioned ancestor is (e.g. a max-w-[1440px] mx-auto <main>) --
      // left-1/2 + -translate-x-1/2 centers a w-screen element on the
      // ancestor's own horizontal center, which coincides with the
      // viewport's center as long as the ancestor itself is centered.
      className="absolute top-0 bottom-0 left-1/2 w-screen -translate-x-1/2 pointer-events-none z-0"
    />
  );
}
