import { useEffect, useMemo, useRef, useState } from "react";
import { RiAlibabaCloudLine } from "react-icons/ri";
import { LOGOS } from "./logos.ts";
import { CONFIG, type CameraMode } from "./config.ts";
import "./App.css";

const SCCC_URL = "https://sccc.sa";

const SPONSORS = [
  {
    eyebrow: "Hosted by",
    name: "Majal Initiative",
    src: LOGOS.majal,
    url: "https://www.linkedin.com/company/majal-initiative",
  },
  {
    eyebrow: "Sponsor",
    name: "Saudi AZM",
    src: LOGOS.azm,
    url: "https://azm.com",
  },
  {
    eyebrow: "Cloud partner",
    name: "SCCC by STC",
    src: LOGOS.sccc,
    url: SCCC_URL,
  },
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SponsorLogo({
  eyebrow,
  name,
  src,
  url,
}: {
  eyebrow: string;
  name: string;
  src: string;
  url: string;
}) {
  return (
    <div className="sponsor-slot">
      <span className="eyebrow">{eyebrow}</span>
      <a
        className="logo-chip"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src={src} alt={name} />
      </a>
    </div>
  );
}

function AuroraBackground({ colors }: { colors: string[] }) {
  const gradient = useMemo(
    () => `linear-gradient(120deg, ${colors.join(", ")})`,
    [colors],
  );
  return <div className="aurora-bg" style={{ backgroundImage: gradient }} />;
}

function BadgeFront({
  config,
  showCameraHint = false,
}: {
  config: {
    name: string;
    funFact: string;
    favorite: { posterUrl: string; title: string; category: string };
  };
  showCameraHint?: boolean;
}) {
  const { name, funFact, favorite } = config;
  return (
    <div className="badge">
      <div className="sheen" />
      <div className="punch-hole" />
      <div className="badge-eyebrow">Cloud Explorer</div>

      <div className="avatar">{initialsOf(name)}</div>
      <h2 className="badge-name">{name}</h2>
      <p className="badge-role">Majal x AZM &middot; Cloud Computing Week</p>

      <div className="fun-fact">
        <span className="label">Fun fact</span>
        {funFact}
      </div>

      <div className="favorite-section">
        <div className="poster-frame">
          <img src={favorite.posterUrl} alt={favorite.title} />
        </div>
        <div className="favorite-text">
          <p className="label">My favorite {favorite.category} is...</p>
          <p className="title">{favorite.title}</p>
        </div>
      </div>

      <div className="stamp">
        I'm learning about Cloud Computing <br />
        on{" "}
        <a
          className="alibaba-link"
          href={SCCC_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <RiAlibabaCloudLine className="alibaba-icon" /> Alibaba Cloud
        </a>
      </div>

      {showCameraHint && (
        <p className="camera-hint">📸 Tap the card for a photo booth!</p>
      )}
    </div>
  );
}

function slugify(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "photo"
  );
}

const SHOT_COUNT = 3;
// Full desaturation - any leftover color reads as a cast (usually blue/cool
// from indoor lighting) and makes skin tones look off.
//
// Modeled after Ilford Delta 400: ~10 stops of range with mild, soft overall
// contrast, a toe that's sharper than the shoulder (shadows compress toward
// black relatively quickly, highlights get a long gentle roll-off that
// resists clipping), and very fine, tight T-grain. A flat gamma+linear
// contrast pass can't express "sharp toe, soft shoulder" - both ends move
// the same way. A sigmoidal S-curve with the midpoint biased toward shadows
// gives that asymmetry for free: the steep part of the curve sits low
// (sharper toe), the flat tail sits in the highlights (soft shoulder), and
// neither end hard-clips.
const MONO_CONTRAST = 3.2; // sigmoid steepness - Delta 400 is mild, not punchy
const MONO_MIDPOINT = 0.46; // <0.5 biases the steep region toward shadows
const MONO_GRAIN = 5; // +/- levels of fine per-pixel grain
const MONO_FILTER = "grayscale(1) contrast(1.1) brightness(1.05)";

function sigmoidalContrast(
  x: number,
  contrast: number,
  midpoint: number,
): number {
  const sig = (v: number) => 1 / (1 + Math.exp(-contrast * (v - midpoint)));
  return (sig(x) - sig(0)) / (sig(1) - sig(0));
}

// iOS Safari doesn't apply CanvasRenderingContext2D.filter, so drawImage()
// there silently ignores it and captures come out in color while the live
// preview (styled with the CSS filter above) looks monochrome. Replicate
// the same tone pipeline per-pixel so captures match the preview on every
// browser.
function applyMonoFilter(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const toned =
      sigmoidalContrast(luminance, MONO_CONTRAST, MONO_MIDPOINT) * 255;
    // Sum of 3 uniforms approximates a gaussian, so the grain reads as fine
    // and tight rather than a blotchy uniform-noise speckle.
    const grain =
      ((Math.random() + Math.random() + Math.random() - 1.5) / 1.5) *
      MONO_GRAIN;
    const gray = Math.min(255, Math.max(0, toned + grain));
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);
}

// A faint glow bleeding in from a random corner/edge, like stray light that
// snuck past the film canister seal. On B&W stock a leak just overexposes
// that patch of emulsion - no color - so this stays a plain white "lighten"
// blend, keeping the shot fully neutral. Kept subtle: low opacity, soft
// falloff, one leak per shot.
function applyLightLeak(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();

  const corners = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ];
  const [cx, cy] = corners[Math.floor(Math.random() * corners.length)];
  const maxDim = Math.max(w, h);
  const radius = maxDim * (0.45 + Math.random() * 0.35);
  const peakAlpha = 0.1 + Math.random() * 0.12;

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${peakAlpha})`);
  gradient.addColorStop(0.6, `rgba(255, 255, 255, ${peakAlpha * 0.35})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.globalCompositeOperation = "lighten";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}

// The raw front-camera frame comes in mirrored (that's why the CSS mirror
// on the live preview looks "normal") - un-mirror it the same way on every
// draw so saved shots read correctly and, for the multi-sample capture
// below, line up before averaging.
function drawMirroredFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  w: number,
  h: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// A cheap, cross-browser soft-focus blur: shrink the frame, then scale it
// back up - the resampling is the blur, no reliance on
// CanvasRenderingContext2D.filter, which iOS Safari doesn't apply.
//
// Shrinking (or growing back) in one big jump can make some engines fall
// back to a cheaper resize filter, which reads as blocky/pixelated rather
// than smoothly blurred. Stepping down by half each time, and back up by
// double each time, keeps every single resize within a range that gets
// proper interpolation.
function resizeCanvas(
  source: HTMLCanvasElement,
  targetW: number,
  targetH: number,
) {
  let currentW = source.width;
  let currentH = source.height;
  let current: HTMLCanvasElement = source;

  while (currentW !== targetW || currentH !== targetH) {
    const shrinking = targetW < currentW;
    const nextW = shrinking
      ? Math.max(targetW, Math.round(currentW / 2))
      : Math.min(targetW, currentW * 2);
    const nextH = shrinking
      ? Math.max(targetH, Math.round(currentH / 2))
      : Math.min(targetH, currentH * 2);

    const step = document.createElement("canvas");
    step.width = nextW;
    step.height = nextH;
    const stepCtx = step.getContext("2d");
    if (!stepCtx) return current;
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = "high";
    stepCtx.drawImage(current, 0, 0, nextW, nextH);

    current = step;
    currentW = nextW;
    currentH = nextH;
  }

  return current;
}

function drawSoftFocusFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  w: number,
  h: number,
  softness = 2.2,
) {
  const full = document.createElement("canvas");
  full.width = w;
  full.height = h;
  const fullCtx = full.getContext("2d");
  if (!fullCtx) return;
  drawMirroredFrame(fullCtx, video, w, h);

  const sw = Math.max(1, Math.round(w / softness));
  const sh = Math.max(1, Math.round(h / softness));
  const shrunk = resizeCanvas(full, sw, sh);
  const blurred = resizeCanvas(shrunk, w, h);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(blurred, 0, 0, w, h);
}

const SHUTTER_DURATION_MS = 1000 / 15; // simulate a 1/15s shutter
const SHUTTER_SAMPLES = 6;

// A slow 1/15s shutter blurs whatever moves during the exposure - hand
// shake, a blink, a laugh - while a still subject stays sharp. A single
// video frame can't show that, so sample the live feed several times across
// that window and average the pixels, the same way a real long exposure
// blends motion into one frame.
async function captureWithShutterBlur(
  video: HTMLVideoElement,
  w: number,
  h: number,
): Promise<ImageData> {
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = w;
  sampleCanvas.height = h;
  const sampleCtx = sampleCanvas.getContext("2d");
  if (!sampleCtx) throw new Error("2D canvas context unavailable");

  const acc = new Float32Array(w * h * 4);
  const interval = SHUTTER_DURATION_MS / (SHUTTER_SAMPLES - 1);
  for (let i = 0; i < SHUTTER_SAMPLES; i++) {
    drawMirroredFrame(sampleCtx, video, w, h);
    const frame = sampleCtx.getImageData(0, 0, w, h).data;
    for (let p = 0; p < frame.length; p++) acc[p] += frame[p];
    if (i < SHUTTER_SAMPLES - 1) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  const out = new Uint8ClampedArray(acc.length);
  for (let p = 0; p < acc.length; p++) out[p] = acc[p] / SHUTTER_SAMPLES;
  return new ImageData(out, w, h);
}

// A light, random pass of dust speckles and thin scratch streaks, like a
// negative that's picked up a bit of grime in the developing tray. Kept
// subtle - a few flecks, not a scratched-up mess.
function applyFilmDamage(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();

  const speckleCount = 10 + Math.floor(Math.random() * 12);
  for (let i = 0; i < speckleCount; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 0.3 + Math.random() * 1.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle =
      Math.random() < 0.7
        ? `rgba(255, 255, 255, ${0.12 + Math.random() * 0.2})`
        : `rgba(15, 15, 15, ${0.08 + Math.random() * 0.15})`;
    ctx.fill();
  }

  const streakCount = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < streakCount; i++) {
    const length = h * (0.3 + Math.random() * 0.6);
    const y0 = Math.random() * (h - length);
    const x = Math.random() * w;
    const jitter = () => (Math.random() - 0.5) * 6;
    ctx.beginPath();
    ctx.moveTo(x + jitter(), y0);
    ctx.lineTo(x + jitter(), y0 + length);
    ctx.lineWidth = 0.4 + Math.random() * 0.6;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 + Math.random() * 0.08})`;
    ctx.stroke();
  }

  ctx.restore();
}

function applyVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength: number,
) {
  ctx.save();
  const gradient = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, `rgba(0, 0, 0, ${strength})`);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

const MODERN_CONTRAST = 2.4;
const MODERN_MIDPOINT = 0.5;
const MODERN_SATURATION = 1.2;
const MODERN_VIGNETTE = 0.1;

// "Modern" is captured as a single sharp frame (fast shutter, no motion
// blur) with a punchier medium-high contrast grade and a saturation lift -
// the kind of baked-in edit a phone camera applies by default, not a raw,
// unedited frame.
function applyModernGrade(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    for (let c = 0; c < 3; c++) {
      const saturated = gray + (data[i + c] - gray) * MODERN_SATURATION;
      const toned =
        sigmoidalContrast(saturated / 255, MODERN_CONTRAST, MODERN_MIDPOINT) *
        255;
      data[i + c] = Math.min(255, Math.max(0, toned));
    }
  }
  ctx.putImageData(imageData, 0, 0);
  applyVignette(ctx, w, h, MODERN_VIGNETTE);
}

const POLAROID_CONTRAST = 1.6;
const POLAROID_MIDPOINT = 0.52;
const POLAROID_FLOOR = 0.06; // lifted blacks - milky shadows, never true black
const POLAROID_CEILING = 0.9; // capped whites - hazy highlights, never a clean white
const POLAROID_VIGNETTE = 0.22;

// A warm color balance and a faded, low-contrast curve with a lifted floor
// and capped ceiling - instant film. Paired with the soft-focus draw and a
// stronger vignette for that plastic-lens instant-camera feel.
function applyPolaroidGrade(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const range = POLAROID_CEILING - POLAROID_FLOOR;
  for (let i = 0; i < data.length; i += 4) {
    const warm = [
      data[i] * 1.08 + 6,
      data[i + 1] * 1.0 + 2,
      data[i + 2] * 0.88,
    ];
    for (let c = 0; c < 3; c++) {
      const toned = sigmoidalContrast(
        warm[c] / 255,
        POLAROID_CONTRAST,
        POLAROID_MIDPOINT,
      );
      data[i + c] = Math.min(
        255,
        Math.max(0, (POLAROID_FLOOR + toned * range) * 255),
      );
    }
  }
  ctx.putImageData(imageData, 0, 0);
  applyVignette(ctx, w, h, POLAROID_VIGNETTE);
}

// Live-preview hints only - the real grade is computed pixel-by-pixel on
// capture (see applyMonoFilter / applyModernGrade / applyPolaroidGrade), so
// these don't need to match exactly.
const MODE_PREVIEW_FILTER: Record<CameraMode, string> = {
  vintage: MONO_FILTER,
  modern: "contrast(1.12) saturate(1.15)",
  polaroid: "contrast(0.92) saturate(1.05) sepia(0.15) brightness(1.05)",
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Draws text rotated a touch off-axis, like it was stamped or scrawled
// by hand onto the strip rather than perfectly typeset.
function drawStamp(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  angleDeg: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// A cheap simulation of the wear a real photobooth strip picks up: dust,
// scratches, a stray light leak, and a soft vignette. Randomized per print
// so retakes don't all look identical.
function applyVintageDamage(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  ctx.save();

  const vignette = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  const leakX = Math.random() < 0.5 ? 0 : w;
  const leakY = h * (0.1 + Math.random() * 0.8);
  const leak = ctx.createRadialGradient(leakX, leakY, 0, leakX, leakY, w * 0.6);
  leak.addColorStop(0, "rgba(255,185,105,0.24)");
  leak.addColorStop(1, "rgba(255,185,105,0)");
  ctx.fillStyle = leak;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  const scratchCount = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < scratchCount; i++) {
    const x = Math.random() * w;
    const startY = Math.random() * h * 0.3;
    const len = h * (0.25 + Math.random() * 0.5);
    const drift = (Math.random() - 0.5) * 14;
    ctx.lineWidth = 0.6 + Math.random() * 1.1;
    ctx.globalAlpha = 0.12 + Math.random() * 0.25;
    ctx.beginPath();
    ctx.moveTo(x, startY);
    ctx.lineTo(x + drift, startY + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const speckCount = Math.round((w * h) / 5500);
  for (let i = 0; i < speckCount; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 1.3 + 0.2;
    const light = Math.random() < 0.5;
    ctx.fillStyle = light
      ? `rgba(255,255,255,${0.15 + Math.random() * 0.25})`
      : `rgba(20,18,14,${0.1 + Math.random() * 0.2})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

async function composeStrip(shotUrls: string[]): Promise<string> {
  const images = await Promise.all(shotUrls.map(loadImage));
  const shotW = images[0].width;
  const shotH = images[0].height;
  const padding = Math.round(shotW * 0.05);
  const gap = Math.round(shotW * 0.04);
  const headerH = Math.round(shotW * 0.12);
  const footerH = Math.round(shotW * 0.16);
  const stripW = shotW + padding * 2;
  const stripH =
    padding * 2 +
    headerH +
    shotH * images.length +
    gap * (images.length - 1) +
    footerH;

  const canvas = document.createElement("canvas");
  canvas.width = stripW;
  canvas.height = stripH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return images[0].src;

  // Make sure the hand-written font is actually loaded before drawing -
  // canvas text silently falls back otherwise. Ephesis is a thin script,
  // so it needs a bigger point size than a bold marker font would.
  const dateFont = `${Math.round(headerH * 0.6)}px "Ephesis", cursive`;
  const captionFont = `${Math.round(footerH * 0.5)}px "Ephesis", cursive`;
  await Promise.all([
    document.fonts.load(dateFont),
    document.fonts.load(captionFont),
  ]);

  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, stripW, stripH);

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  ctx.fillStyle = "#3a352c";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = dateFont;
  drawStamp(ctx, dateLabel, stripW / 2, padding + headerH / 2, -2);

  images.forEach((img, i) => {
    const y = padding + headerH + i * (shotH + gap);
    ctx.drawImage(img, padding, y, shotW, shotH);
  });

  ctx.fillStyle = "#2a2620";
  ctx.font = captionFont;
  drawStamp(
    ctx,
    "☁️ Cloud Explorer Photo Booth",
    stripW / 2,
    stripH - footerH / 2,
    -1.5,
  );

  applyVintageDamage(ctx, stripW, stripH);

  return canvas.toDataURL("image/png");
}

function CameraBack({ name, onClose }: { name: string; onClose: () => void }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [stripPhoto, setStripPhoto] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const mode = CONFIG.photoBoothMode;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // This component only mounts while the card is flipped to its camera
  // side, so start the front camera on mount and release it on unmount -
  // the stream never needs to leave the device.
  useEffect(() => {
    let cancelled = false;
    let localStream: MediaStream | null = null;

    Promise.resolve()
      .then(() => {
        if (!navigator.mediaDevices?.getUserMedia) {
          return Promise.reject(
            new DOMException("Camera unsupported", "NotSupportedError"),
          );
        }
        return navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        localStream = s;
        setStream(s);
      })
      .catch((err: DOMException) => {
        if (cancelled) return;
        setCameraError(
          err.name === "NotSupportedError"
            ? "Camera access isn't available here. It needs a secure context (HTTPS or localhost) and a browser that supports it."
            : err.name === "NotAllowedError"
              ? "Camera access was denied. Allow the camera permission for this page and try again."
              : "Couldn't reach a front camera on this device.",
        );
      });

    return () => {
      cancelled = true;
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Once all shots are in, compose the vintage strip.
  useEffect(() => {
    if (shots.length !== SHOT_COUNT) return;
    let cancelled = false;
    composeStrip(shots).then((strip) => {
      if (!cancelled) setStripPhoto(strip);
    });
    return () => {
      cancelled = true;
    };
  }, [shots]);

  async function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (
      !video ||
      !canvas ||
      !cameraReady ||
      isCapturing ||
      shots.length >= SHOT_COUNT
    )
      return;
    setIsCapturing(true);
    try {
      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (mode === "vintage") {
        const blurred = await captureWithShutterBlur(video, w, h);
        ctx.putImageData(blurred, 0, 0);
        applyMonoFilter(ctx, w, h);
        applyLightLeak(ctx, w, h);
        applyFilmDamage(ctx, w, h);
      } else if (mode === "modern") {
        drawMirroredFrame(ctx, video, w, h);
        applyModernGrade(ctx, w, h);
      } else {
        drawSoftFocusFrame(ctx, video, w, h);
        applyPolaroidGrade(ctx, w, h);
        applyLightLeak(ctx, w, h);
      }

      setShots((prev) => [...prev, canvas.toDataURL("image/png")]);
      setFlash(true);
      setTimeout(() => setFlash(false), 250);
    } finally {
      setIsCapturing(false);
    }
  }

  function handleRetake() {
    setShots([]);
    setStripPhoto(null);
  }

  function handleSaveStrip() {
    if (!stripPhoto) return;
    const link = document.createElement("a");
    link.href = stripPhoto;
    link.download = `${slugify(name)}-photobooth-strip-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="badge camera-card">
      <div className="punch-hole" />
      <button
        type="button"
        className="close-btn"
        aria-label="Close photo booth"
        onClick={onClose}
      >
        ✕
      </button>

      <div className="badge-eyebrow">Photo Booth</div>

      {/* The live <video> stays mounted for as long as the booth is active,
          so its srcObject survives across capture / retake - only its
          visibility toggles. Re-mounting it would drop the camera feed. */}
      <div
        className="camera-viewport"
        style={{ display: stripPhoto ? "none" : "flex" }}
      >
        {flash && <div className="flash-overlay" />}

        {cameraError && <p className="camera-message">{cameraError}</p>}

        {!cameraError && !cameraReady && (
          <p className="camera-message">Starting camera…</p>
        )}

        <video
          ref={videoRef}
          className="camera-video"
          style={{
            filter: MODE_PREVIEW_FILTER[mode],
            display: !cameraError && cameraReady ? "block" : "none",
          }}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setCameraReady(true)}
        />

        {!cameraError && cameraReady && (
          <div className="shot-dots">
            {Array.from({ length: SHOT_COUNT }).map((_, i) => (
              <span
                key={i}
                className={`shot-dot${i < shots.length ? " filled" : ""}`}
              />
            ))}
          </div>
        )}
      </div>

      {stripPhoto && (
        <div className="strip-preview">
          <img
            className="strip-img"
            src={stripPhoto}
            alt="Photo booth strip of 3 shots"
          />
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div className="camera-controls">
        {!stripPhoto && !cameraError && (
          <button
            type="button"
            className="shutter-btn"
            disabled={!cameraReady || isCapturing}
            onClick={handleCapture}
            aria-label="Take photo"
          />
        )}
        {stripPhoto && (
          <>
            <button type="button" className="ghost-btn" onClick={handleRetake}>
              Retake
            </button>
            <button
              type="button"
              className="solid-btn"
              onClick={handleSaveStrip}
            >
              Save strip
            </button>
          </>
        )}
      </div>

      <p className="camera-footnote">
        {stripPhoto
          ? "Nothing leaves this device - the strip only saves to your downloads."
          : `Shot ${Math.min(shots.length + 1, SHOT_COUNT)} of ${SHOT_COUNT} - smile!`}
      </p>
    </div>
  );
}

function FlipBadge({
  config,
  enablePhotoBooth,
}: {
  config: {
    name: string;
    funFact: string;
    favorite: { posterUrl: string; title: string; category: string };
  };
  enablePhotoBooth: boolean;
}) {
  const [flipped, setFlipped] = useState(false);

  if (!enablePhotoBooth) {
    return (
      <div className="flip-card">
        <BadgeFront config={config} />
      </div>
    );
  }

  return (
    <div className={`flip-card${flipped ? " flipped" : ""}`}>
      <div className="flip-card-inner">
        <div
          className="flip-card-front"
          role="button"
          tabIndex={0}
          aria-label="Open photo booth"
          onClick={() => setFlipped(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFlipped(true);
            }
          }}
        >
          <BadgeFront config={config} showCameraHint />
        </div>
        <div className="flip-card-back">
          {flipped && (
            <CameraBack name={config.name} onClose={() => setFlipped(false)} />
          )}
        </div>
      </div>
    </div>
  );
}

// Set by Caddy's `templates` directive from the POD_NAME env var (see
// index.html) - only present when running as a Pod, so this is empty for
// `docker run` or a plain `npm run dev`.
const podName = document
  .querySelector('meta[name="pod-name"]')
  ?.getAttribute("content");

export default function App() {
  return (
    <>
      <AuroraBackground colors={CONFIG.gradientColors} />

      <div className="sponsor-bar">
        {SPONSORS.map((s) => (
          <SponsorLogo key={s.name} {...s} />
        ))}
      </div>

      <div className="page-heading">
        <h1>My Cloud Explorer Badge</h1>
        <p>
          Deployed by me, running on{" "}
          {CONFIG.isOnCloud ? "Alibaba Cloud! ☁️" : "my Laptop!  💻"}
        </p>
        {podName && <p className="pod-name">served by pod: {podName}</p>}
      </div>

      <div className="badge-wrap">
        <FlipBadge config={CONFIG} enablePhotoBooth={CONFIG.enablePhotoBooth} />
      </div>

      {/* <div className="footnote">
        Want to make this yours? Edit the <code>CONFIG</code> object in{" "}
        <code>app.jsx</code> and rebuild.
      </div> */}
    </>
  );
}
