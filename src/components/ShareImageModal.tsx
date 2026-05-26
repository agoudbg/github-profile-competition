"use client";

import { Download, X } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SHARE_VALID_DAYS, type ShareAccount, type SharePayload } from "@/lib/share";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1500;
const BACKGROUND = "#fffdf8";
const INK = "#16181d";
const INK_MUTED = "#5d6470";
const LINE = "#d8d1c3";
const ACCENT = "#0f766e";
const WARM = "#c05621";
const SURFACE = "#f7f4ee";
const ACCENT_SOFT = "#d7f2ec";
const WARM_SOFT = "#f6dfc7";

type AvatarMap = Record<string, HTMLImageElement | null>;

type RadarPoint = {
  angle: number;
  label: string;
  leftScore: number;
  rightScore: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "未知日期";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    color?: string;
    font?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    maxWidth?: number;
  } = {}
): void {
  context.fillStyle = options.color ?? INK;
  context.font = options.font ?? "24px sans-serif";
  context.textAlign = options.align ?? "left";
  context.textBaseline = options.baseline ?? "alphabetic";
  context.fillText(text, x, y, options.maxWidth);
}

function drawCard(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  context.save();
  context.fillStyle = "#ffffff";
  context.strokeStyle = LINE;
  context.lineWidth = 2;
  roundRect(context, x, y, width, height, 18);
  context.fill();
  context.stroke();
  context.restore();
}

function drawAvatar(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  fallback: string,
  color: string
): void {
  context.save();
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.clip();

  if (image) {
    context.drawImage(image, x, y, size, size);
  } else {
    context.fillStyle = color;
    context.fillRect(x, y, size, size);
    drawText(context, fallback.slice(0, 1).toUpperCase(), x + size / 2, y + size / 2 + 2, {
      color: "#ffffff",
      font: "900 38px sans-serif",
      align: "center",
      baseline: "middle"
    });
  }

  context.restore();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 5;
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2 - 2, 0, Math.PI * 2);
  context.stroke();
}

function drawScoreCard(
  context: CanvasRenderingContext2D,
  account: ShareAccount,
  avatar: HTMLImageElement | null,
  x: number,
  y: number,
  width: number,
  isWinner: boolean,
  color: string
): void {
  drawCard(context, x, y, width, 205);
  drawAvatar(context, avatar, x + 28, y + 18, 62, account.username, color);

  drawText(context, `@${account.username}`, x + 108, y + 57, {
    color: INK,
    font: "800 28px sans-serif",
    maxWidth: width - 255
  });

  if (isWinner) {
    context.fillStyle = ACCENT_SOFT;
    roundRect(context, x + width - 140, y + 32, 96, 34, 17);
    context.fill();
    drawText(context, "胜出", x + width - 92, y + 49, {
      color: ACCENT,
      font: "800 17px sans-serif",
      align: "center",
      baseline: "middle"
    });
  }

  drawText(context, String(account.totalScore), x + 34, y + 118, {
    color,
    font: "900 62px sans-serif",
    baseline: "middle"
  });
  drawText(context, "最终总分", x + 38, y + 172, {
    color: INK_MUTED,
    font: "800 18px sans-serif"
  });

  drawText(context, `系统 ${account.systemScore}`, x + width - 190, y + 138, {
    color: INK_MUTED,
    font: "800 19px sans-serif"
  });
  drawText(context, `LLM ${account.llmScore ?? "暂无"}`, x + width - 190, y + 172, {
    color: INK_MUTED,
    font: "800 19px sans-serif"
  });
}

function buildRadarPoints(left: ShareAccount, right: ShareAccount): RadarPoint[] {
  const dimensions = left.dimensions.length > 0 ? left.dimensions : right.dimensions;
  const step = (Math.PI * 2) / Math.max(dimensions.length, 1);

  return dimensions.map((dimension, index) => {
    const leftDimension = left.dimensions.find((item) => item.key === dimension.key);
    const rightDimension = right.dimensions.find((item) => item.key === dimension.key);

    return {
      angle: -Math.PI / 2 + step * index,
      label: dimension.label,
      leftScore: leftDimension?.score ?? 0,
      rightScore: rightDimension?.score ?? 0
    };
  });
}

function getRadarCoordinate(centerX: number, centerY: number, radius: number, angle: number, score: number): [number, number] {
  const normalizedScore = clamp(score, 0, 100) / 100;
  return [centerX + Math.cos(angle) * radius * normalizedScore, centerY + Math.sin(angle) * radius * normalizedScore];
}

function drawRadarPolygon(
  context: CanvasRenderingContext2D,
  points: RadarPoint[],
  centerX: number,
  centerY: number,
  radius: number,
  scoreSelector: (point: RadarPoint) => number,
  color: string,
  fillAlpha: number
): void {
  context.beginPath();
  points.forEach((point, index) => {
    const [x, y] = getRadarCoordinate(centerX, centerY, radius, point.angle, scoreSelector(point));
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.closePath();
  context.fillStyle = `${color}${fillAlpha.toString(16).padStart(2, "0")}`;
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.fill();
  context.stroke();
}

function drawRadarChart(context: CanvasRenderingContext2D, left: ShareAccount, right: ShareAccount): void {
  const centerX = 540;
  const centerY = 928;
  const radius = 205;
  const labelRadius = 238;
  const points = buildRadarPoints(left, right);

  drawText(context, "维度分析图", 104, 604, {
    font: "900 28px sans-serif"
  });
  drawText(context, "与页面展示一致，五个维度按 0-100 分展开。", 104, 639, {
    color: INK_MUTED,
    font: "18px sans-serif"
  });

  context.save();
  context.strokeStyle = LINE;
  context.lineWidth = 2;

  for (let level = 1; level <= 5; level += 1) {
    const levelRadius = (radius / 5) * level;
    context.beginPath();
    points.forEach((point, index) => {
      const x = centerX + Math.cos(point.angle) * levelRadius;
      const y = centerY + Math.sin(point.angle) * levelRadius;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.closePath();
    context.stroke();
  }

  for (const point of points) {
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(centerX + Math.cos(point.angle) * radius, centerY + Math.sin(point.angle) * radius);
    context.stroke();
  }

  drawRadarPolygon(context, points, centerX, centerY, radius, (point) => point.rightScore, WARM, 40);
  drawRadarPolygon(context, points, centerX, centerY, radius, (point) => point.leftScore, ACCENT, 46);

  for (const point of points) {
    const labelX = centerX + Math.cos(point.angle) * labelRadius;
    const labelY = centerY + Math.sin(point.angle) * labelRadius - (point.label === "追随者" ? 10 : 0);
    const align: CanvasTextAlign = labelX < centerX - 30 ? "right" : labelX > centerX + 30 ? "left" : "center";

    drawText(context, point.label, labelX, labelY, {
      color: INK,
      font: "800 17px sans-serif",
      align,
      baseline: "middle",
      maxWidth: 150
    });
    drawText(context, `${point.leftScore} / ${point.rightScore}`, labelX, labelY + 25, {
      color: INK_MUTED,
      font: "15px sans-serif",
      align,
      baseline: "middle"
    });
  }

  context.fillStyle = ACCENT;
  roundRect(context, 386, 1208, 24, 13, 7);
  context.fill();
  drawText(context, left.username, 422, 1215, {
    color: INK,
    font: "800 18px sans-serif",
    baseline: "middle"
  });

  context.fillStyle = WARM;
  roundRect(context, 552, 1208, 24, 13, 7);
  context.fill();
  drawText(context, right.username, 588, 1215, {
    color: INK,
    font: "800 18px sans-serif",
    baseline: "middle"
  });

  context.restore();
}

async function drawQrCode(context: CanvasRenderingContext2D, pageUrl: string, x: number, y: number, size: number): Promise<void> {
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, pageUrl, {
    color: {
      dark: INK,
      light: "#ffffff"
    },
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 8,
    width: size
  });

  context.drawImage(qrCanvas, x, y, size, size);
}

async function drawShareImage(context: CanvasRenderingContext2D, payload: SharePayload, avatars: AvatarMap): Promise<void> {
  const [left, right] = payload.accounts;
  const winner = payload.winner;
  const margin = Math.abs(left.totalScore - right.totalScore);
  const winnerText = winner ? `${winner} 胜出` : "势均力敌";
  const leadText = winner ? `总分领先 ${margin} 分` : "双方总分非常接近";

  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const gradient = context.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  gradient.addColorStop(0, "#edf7f4");
  gradient.addColorStop(0.55, "#fffdf8");
  gradient.addColorStop(1, "#f9efe3");
  context.fillStyle = gradient;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  drawText(context, "GitHub 账号比拼", 70, 86, {
    color: INK_MUTED,
    font: "800 24px sans-serif"
  });
  drawText(context, `${left.username} vs ${right.username}`, 70, 154, {
    color: INK,
    font: "900 52px sans-serif",
    maxWidth: 940
  });

  context.fillStyle = winner ? ACCENT_SOFT : WARM_SOFT;
  roundRect(context, 70, 192, 335, 58, 29);
  context.fill();
  drawText(context, winnerText, 238, 222, {
    color: winner ? ACCENT : WARM,
    font: "900 25px sans-serif",
    align: "center",
    baseline: "middle"
  });
  drawText(context, leadText, 438, 224, {
    color: INK_MUTED,
    font: "800 19px sans-serif",
    baseline: "middle"
  });

  drawScoreCard(context, left, avatars[left.username] ?? null, 70, 292, 450, left.username === winner, ACCENT);
  drawScoreCard(context, right, avatars[right.username] ?? null, 560, 292, 450, right.username === winner, WARM);

  drawCard(context, 70, 540, 940, 760);
  drawRadarChart(context, left, right);

  context.fillStyle = SURFACE;
  roundRect(context, 70, 1328, 940, 126, 18);
  context.fill();
  drawText(context, "扫码打开比拼页面", 104, 1374, {
    color: INK,
    font: "900 24px sans-serif"
  });
  drawText(context, `比拼信息 ${SHARE_VALID_DAYS} 天内有效，截止 ${formatDate(payload.expiresAt)}。`, 104, 1410, {
    color: INK_MUTED,
    font: "18px sans-serif",
    maxWidth: 660
  });
  await drawQrCode(context, payload.pageUrl, 894, 1350, 82);
}

function loadAvatar(url: string): Promise<HTMLImageElement | null> {
  if (!url) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

type ShareImageModalProps = {
  payload: SharePayload;
  onClose: () => void;
};

export function ShareImageModal({ payload, onClose }: ShareImageModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const fileName = useMemo(() => {
    const [left, right] = payload.accounts;
    return `github-profile-competition-${left.username}-vs-${right.username}.png`;
  }, [payload]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function renderImage() {
      const context = canvasRef.current?.getContext("2d");
      if (!context) {
        setCanvasError("当前浏览器不支持 Canvas。");
        return;
      }

      const avatarEntries = await Promise.all(
        payload.accounts.map(async (account) => [account.username, await loadAvatar(account.avatarUrl)] as const)
      );

      if (isCancelled) {
        return;
      }

      await drawShareImage(context, payload, Object.fromEntries(avatarEntries));
      setCanvasError(null);
    }

    void renderImage();

    return () => {
      isCancelled = true;
    };
  }, [payload]);

  const downloadImage = useCallback(() => {
    if (!canvasRef.current) {
      return;
    }

    const link = document.createElement("a");
    link.href = canvasRef.current.toDataURL("image/png");
    link.download = fileName;
    link.click();
  }, [fileName]);

  const modal = (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        className="share-image-modal"
        role="dialog"
        aria-labelledby="share-image-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <h2 id="share-image-title">保存结果图片</h2>
            <p>比拼信息 {SHARE_VALID_DAYS} 天内有效。</p>
          </div>
          <div className="share-image-modal-actions">
            <button className="icon-text-button" type="button" onClick={downloadImage}>
              <Download size={17} aria-hidden="true" />
              下载 PNG
            </button>
            <button className="icon-button" type="button" onClick={onClose} title="关闭">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {canvasError ? (
          <div className="share-image-error" role="alert">
            {canvasError}
          </div>
        ) : null}
        <div className="share-image-canvas-wrap" aria-label="分享图片预览">
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
        </div>
      </section>
    </div>
  );

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(modal, document.body);
}
