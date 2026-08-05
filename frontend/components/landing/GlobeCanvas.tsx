"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface GlobeHandle {
  focus: (index: number) => void;
}

const MARKERS = [
  { lat: 37.7, lng: -122.4, label: "Search", color: "#178C7E" },
  { lat: 51.5, lng: -0.12, label: "Verify", color: "#E8A33D" },
  { lat: 1.35, lng: 103.8, label: "Sandbox", color: "#072AC8" },
];

// Coarse continent blobs [lat, lng, rLat, rLng] used to fake a landmass
// dot-mask on the sphere without shipping real geo data for a decorative
// globe.
const LAND: [number, number, number, number][] = [
  [62, -105, 11, 24], [50, -100, 9, 22], [40, -98, 8, 18], [30, -104, 6, 9], [65, -152, 7, 11], [75, -40, 8, 14], [16, -90, 4, 7], [8, -80, 3, 4],
  [2, -62, 8, 13], [-10, -55, 9, 11], [-22, -60, 8, 7], [-35, -65, 7, 4], [-48, -71, 5, 3],
  [18, 8, 8, 17], [26, 15, 7, 14], [0, 20, 10, 11], [-14, 25, 8, 8], [-28, 25, 5, 5], [8, -5, 5, 9], [-19, 47, 3, 2],
  [50, 15, 6, 14], [60, 30, 6, 18], [45, 28, 5, 10], [40, -4, 4, 6], [54, -3, 3, 3],
  [62, 95, 9, 38], [52, 85, 8, 28], [36, 102, 8, 14], [30, 82, 5, 10], [21, 78, 8, 6], [14, 102, 5, 6], [38, 58, 7, 12], [24, 45, 6, 8], [62, 145, 8, 14], [37, 138, 4, 3], [-2, 115, 3, 10],
  [-25, 135, 7, 10], [-42, 172, 3, 2],
  [-80, 0, 8, 180], [-72, 70, 4, 30], [-70, -60, 5, 15],
];

export const GlobeCanvas = forwardRef<GlobeHandle, { activeIndex: number; onActiveChange: (i: number) => void }>(
  function GlobeCanvas({ activeIndex, onActiveChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const activeRef = useRef(activeIndex);
    activeRef.current = activeIndex;
    const focusRef = useRef<(i: number) => void>(() => {});

    useImperativeHandle(ref, () => ({ focus: (i: number) => focusRef.current(i) }), []);

    useEffect(() => {
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;

      const DPR = window.devicePixelRatio || 1;
      let W = 0;
      let H = 0;
      let R = 0;
      let cx = 0;
      let cy = 0;

      const resize = () => {
        const r = cv.getBoundingClientRect();
        W = cv.width = r.width * DPR;
        H = cv.height = r.width * DPR;
        cx = W / 2;
        cy = H / 2;
        R = W * 0.4;
      };
      resize();

      const D2R = Math.PI / 180;
      const vec = (lat: number, lng: number): [number, number, number] => {
        const la = lat * D2R;
        const lo = lng * D2R;
        return [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
      };
      const mVecs = MARKERS.map((m) => vec(m.lat, m.lng));

      const isLand = (lat: number, lng: number) => {
        for (const [bla, bln, rla, rln] of LAND) {
          const dla = lat - bla;
          const dln = (((lng - bln + 540) % 360) - 180);
          if ((dla * dla) / (rla * rla) + (dln * dln) / (rln * rln) < 1) return true;
        }
        return false;
      };

      const dots: [number, number, number, boolean][] = [];
      for (let i = 0; i < 6500; i++) {
        const y = 1 - (i / 6499) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = i * 2.39996;
        const x = Math.cos(th) * r;
        const z = Math.sin(th) * r;
        const lat = Math.asin(y) / D2R;
        const lng = Math.atan2(z, x) / D2R;
        dots.push([x, y, z, isLand(lat, lng)]);
      }

      let yaw = 2.6;
      let pitch = 0.4;
      let tYaw: number | null = null;
      let tPitch = 0;
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      let moved = 0;
      let idle = 999;
      let t = 0;
      let raf = 0;

      const rot = (p: [number, number, number]): [number, number, number] => {
        const [x, y, z] = p;
        const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
        const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
        const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
        const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
        return [x1, y2, z2];
      };

      const focus = (i: number) => {
        const [x, , z] = mVecs[i];
        tYaw = -Math.atan2(x, z);
        tPitch = MARKERS[i].lat * D2R;
        onActiveChange(i);
      };
      focusRef.current = focus;

      const screens: ([number, number] | null)[] = [null, null, null];

      const down = (e: PointerEvent) => {
        dragging = true;
        moved = 0;
        lastX = e.clientX;
        lastY = e.clientY;
        cv.setPointerCapture(e.pointerId);
        cv.style.cursor = "grabbing";
      };
      const move = (e: PointerEvent) => {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        moved += Math.abs(dx) + Math.abs(dy);
        yaw += dx * 0.006;
        pitch = Math.max(-1.1, Math.min(1.1, pitch + dy * 0.005));
        lastX = e.clientX;
        lastY = e.clientY;
        tYaw = null;
        idle = 0;
      };
      const up = (e: PointerEvent) => {
        dragging = false;
        cv.style.cursor = "grab";
        idle = 0;
        if (moved < 6) {
          const r = cv.getBoundingClientRect();
          const px = (e.clientX - r.left) * DPR;
          const py = (e.clientY - r.top) * DPR;
          for (let i = 0; i < 3; i++) {
            const s = screens[i];
            if (!s) continue;
            const nearDot = Math.hypot(px - s[0], py - s[1]) < 30 * DPR;
            const onLabel = px > s[0] + 8 * DPR && px < s[0] + 95 * DPR && Math.abs(py - s[1]) < 16 * DPR;
            if (nearDot || onLabel) {
              focus(i);
              break;
            }
          }
        }
      };
      cv.addEventListener("pointerdown", down);
      cv.addEventListener("pointermove", move);
      cv.addEventListener("pointerup", up);
      window.addEventListener("resize", resize, { passive: true });

      const slerp = (a: [number, number, number], b: [number, number, number], u: number): [number, number, number] => {
        const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
        const om = Math.acos(d);
        const so = Math.sin(om) || 1e-6;
        const ka = Math.sin((1 - u) * om) / so;
        const kb = Math.sin(u * om) / so;
        const alt = 1 + Math.sin(u * Math.PI) * 0.28;
        return [(a[0] * ka + b[0] * kb) * alt, (a[1] * ka + b[1] * kb) * alt, (a[2] * ka + b[2] * kb) * alt];
      };

      const tick = () => {
        t += 0.016;
        idle++;
        if (tYaw !== null) {
          let d = tYaw - yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          yaw += d * 0.08;
          pitch += (tPitch - pitch) * 0.08;
          if (Math.abs(d) < 0.004 && Math.abs(tPitch - pitch) < 0.004) tYaw = null;
        } else if (!dragging && idle > 200) {
          yaw += 0.0022;
        }
        ctx.clearRect(0, 0, W, H);

        const halo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.14);
        halo.addColorStop(0, "rgba(126,178,232,0)");
        halo.addColorStop(0.62, "rgba(126,178,232,.32)");
        halo.addColorStop(1, "rgba(126,178,232,0)");
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.14, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();

        const g = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.08, cx, cy, R * 1.02);
        g.addColorStop(0, "#9CC4EE");
        g.addColorStop(0.35, "#5D8FD6");
        g.addColorStop(0.75, "#2C56A8");
        g.addColorStop(1, "#16306B");
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.clip();
        for (let k = 0; k < 4; k++) {
          const baseY = cy + ((((t * 12 + k * 90) % 360) / 360) * 2 - 1) * R;
          ctx.beginPath();
          for (let sx = -R; sx <= R; sx += 8 * DPR) {
            const y = baseY + Math.sin(sx / (34 * DPR) + t * 1.4 + k * 1.7) * 5 * DPR;
            if (sx === -R) ctx.moveTo(cx + sx, y);
            else ctx.lineTo(cx + sx, y);
          }
          const fade = 1 - Math.abs(baseY - cy) / R;
          ctx.lineWidth = 1.3 * DPR;
          ctx.strokeStyle = `rgba(190,220,255,${0.14 * Math.max(fade, 0)})`;
          ctx.stroke();
        }
        ctx.restore();

        for (const p of dots) {
          if (!p[3]) continue;
          const [x1, y2, z2] = rot([p[0], p[1], p[2]]);
          if (z2 < 0.02) continue;
          const lit = Math.max(0, -x1 * 0.45 + y2 * 0.45 + z2 * 0.75);
          ctx.beginPath();
          ctx.arc(cx + x1 * R, cy - y2 * R, (0.7 + 0.6 * z2) * 1.3 * DPR, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${Math.round(150 + 70 * lit)},${Math.round(215 + 30 * lit)},${Math.round(185 + 30 * lit)},${0.35 + 0.6 * z2})`;
          ctx.fill();
        }

        const night = ctx.createRadialGradient(cx + R * 0.55, cy + R * 0.5, R * 0.25, cx + R * 0.25, cy + R * 0.22, R * 1.25);
        night.addColorStop(0, "rgba(10,18,45,.38)");
        night.addColorStop(0.55, "rgba(10,18,45,.12)");
        night.addColorStop(1, "rgba(10,18,45,0)");
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = night;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        const spec = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.5, 0, cx - R * 0.45, cy - R * 0.5, R * 0.5);
        spec.addColorStop(0, "rgba(255,255,255,.4)");
        spec.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = spec;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx, cy, R - 0.5 * DPR, 0, Math.PI * 2);
        ctx.lineWidth = 1.2 * DPR;
        ctx.strokeStyle = "rgba(200,224,255,.55)";
        ctx.stroke();

        const pairs: [number, number][] = [[0, 1], [1, 2], [2, 0]];
        pairs.forEach(([ai, bi], k) => {
          ctx.beginPath();
          let pen = false;
          const samples: [number, number, number][] = [];
          for (let s = 0; s <= 60; s++) {
            const u = s / 60;
            const [x1, y2, z2] = rot(slerp(mVecs[ai], mVecs[bi], u));
            samples.push([cx + x1 * R, cy - y2 * R, z2]);
            if (z2 > 0) {
              if (!pen) {
                ctx.moveTo(samples[s][0], samples[s][1]);
                pen = true;
              } else ctx.lineTo(samples[s][0], samples[s][1]);
            } else pen = false;
          }
          ctx.lineWidth = 1.4 * DPR;
          ctx.strokeStyle = "rgba(255,255,255,.65)";
          ctx.stroke();
          const head = samples[Math.floor(((t * 0.22 + k / 3) % 1) * 60)];
          if (head && head[2] > 0) {
            ctx.beginPath();
            ctx.arc(head[0], head[1], 2.6 * DPR, 0, Math.PI * 2);
            ctx.fillStyle = "#fff";
            ctx.fill();
          }
        });

        let front = 0;
        let frontZ = -2;
        for (let i = 0; i < 3; i++) {
          const [x1, y2, z2] = rot(mVecs[i]);
          if (z2 > frontZ) {
            frontZ = z2;
            front = i;
          }
          if (z2 < 0) {
            screens[i] = null;
            continue;
          }
          const sx = cx + x1 * R;
          const sy = cy - y2 * R;
          screens[i] = [sx, sy];
          const active = activeRef.current === i;
          if (active) {
            const pr = ((t * 30) % 26) * DPR;
            ctx.beginPath();
            ctx.arc(sx, sy, 7 * DPR + pr, 0, Math.PI * 2);
            ctx.lineWidth = 1.4 * DPR;
            ctx.strokeStyle = MARKERS[i].color + Math.round(160 * (1 - pr / (26 * DPR))).toString(16).padStart(2, "0");
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(sx, sy, (active ? 7 : 5) * DPR, 0, Math.PI * 2);
          ctx.fillStyle = MARKERS[i].color;
          ctx.fill();
          ctx.lineWidth = 2 * DPR;
          ctx.strokeStyle = "#fff";
          ctx.stroke();
          ctx.font = `600 ${13 * DPR}px "Alte Haas Grotesk", sans-serif`;
          ctx.textBaseline = "middle";
          ctx.lineWidth = 3 * DPR;
          ctx.strokeStyle = "rgba(238,241,234,.9)";
          ctx.strokeText(MARKERS[i].label, sx + 12 * DPR, sy);
          ctx.fillStyle = "#1C2621";
          ctx.fillText(MARKERS[i].label, sx + 12 * DPR, sy);
        }
        if (frontZ > 0.25 && front !== activeRef.current && tYaw === null && (dragging || idle > 200)) {
          onActiveChange(front);
        }

        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(raf);
        cv.removeEventListener("pointerdown", down);
        cv.removeEventListener("pointermove", move);
        cv.removeEventListener("pointerup", up);
        window.removeEventListener("resize", resize);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <canvas
        ref={canvasRef}
        style={{ width: "min(620px,100%)", aspectRatio: "1/1", display: "block", cursor: "grab", touchAction: "none" }}
      />
    );
  }
);
