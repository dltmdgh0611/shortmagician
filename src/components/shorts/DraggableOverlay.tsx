import { useState, useRef, useCallback, type ReactNode, type CSSProperties, type PointerEvent, type RefObject } from "react";

type ResizeHandle = "nw" | "ne" | "sw" | "se";

interface DraggableOverlayProps {
  /** Parent container ref — used to convert pixel coordinates to percentages */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Position & size in percentages (0–100) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Called when the user drags or resizes the overlay */
  onChange: (pos: { x: number; y: number; width: number; height: number }) => void;
  /** Minimum dimensions in percentages (default 5% width, 3% height) */
  minWidth?: number;
  minHeight?: number;
  /** CSS z-index (default 5) */
  zIndex?: number;
  /** Theme color for border and resize handles (any CSS color string) */
  borderColor?: string;
  /** Center label shown on hover when no children are present */
  label?: string;
  /** Extra styles applied to the overlay div (e.g., backdropFilter for blur) */
  overlayStyle?: CSSProperties;
  /** Content rendered inside the overlay (e.g., subtitle text) */
  children?: ReactNode;
  /** Called on pointer-down before drag starts (use for selection) */
  onInteract?: () => void;
}

export function DraggableOverlay({
  containerRef,
  x, y, width, height,
  onChange,
  minWidth = 5,
  minHeight = 3,
  zIndex = 5,
  borderColor = "rgb(147, 51, 234)",
  label,
  overlayStyle,
  children,
  onInteract,
}: DraggableOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
  const [isHovering, setIsHovering] = useState(false);

  const dragStartRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const resizeStartRef = useRef<{
    px: number; py: number;
    x: number; y: number;
    w: number; h: number;
    handle: ResizeHandle;
  } | null>(null);

  const pxToPercent = useCallback((pxX: number, pxY: number) => {
    const el = containerRef.current;
    if (!el) return { pctX: 0, pctY: 0 };
    const rect = el.getBoundingClientRect();
    return {
      pctX: (pxX / rect.width) * 100,
      pctY: (pxY / rect.height) * 100,
    };
  }, [containerRef]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    onInteract?.();
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = { px: e.clientX, py: e.clientY, x, y };
  }, [x, y]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (isDragging && dragStartRef.current) {
      const delta = pxToPercent(
        e.clientX - dragStartRef.current.px,
        e.clientY - dragStartRef.current.py,
      );
      const newX = Math.max(0, Math.min(100 - width, dragStartRef.current.x + delta.pctX));
      const newY = Math.max(0, Math.min(100 - height, dragStartRef.current.y + delta.pctY));
      onChange({ x: newX, y: newY, width, height });
    }

    if (isResizing && resizeStartRef.current) {
      const rs = resizeStartRef.current;
      const deltaPct = pxToPercent(e.clientX - rs.px, e.clientY - rs.py);

      let newX = rs.x, newY = rs.y, newW = rs.w, newH = rs.h;

      if (rs.handle === "nw") {
        newX = rs.x + deltaPct.pctX; newY = rs.y + deltaPct.pctY;
        newW = rs.w - deltaPct.pctX; newH = rs.h - deltaPct.pctY;
      } else if (rs.handle === "ne") {
        newY = rs.y + deltaPct.pctY;
        newW = rs.w + deltaPct.pctX; newH = rs.h - deltaPct.pctY;
      } else if (rs.handle === "sw") {
        newX = rs.x + deltaPct.pctX;
        newW = rs.w - deltaPct.pctX; newH = rs.h + deltaPct.pctY;
      } else if (rs.handle === "se") {
        newW = rs.w + deltaPct.pctX; newH = rs.h + deltaPct.pctY;
      }

      // Enforce minimums
      if (newW < minWidth) {
        newW = minWidth;
        if (rs.handle === "nw" || rs.handle === "sw") newX = rs.x + rs.w - minWidth;
      }
      if (newH < minHeight) {
        newH = minHeight;
        if (rs.handle === "nw" || rs.handle === "ne") newY = rs.y + rs.h - minHeight;
      }

      // Clamp to container bounds
      newX = Math.max(0, Math.min(newX, 100 - newW));
      newY = Math.max(0, Math.min(newY, 100 - newH));
      newW = Math.min(newW, 100 - newX);
      newH = Math.min(newH, 100 - newY);

      onChange({ x: newX, y: newY, width: newW, height: newH });
    }
  }, [isDragging, isResizing, pxToPercent, width, height, minWidth, minHeight, onChange]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    setActiveHandle(null);
    dragStartRef.current = null;
    resizeStartRef.current = null;
  }, []);

  const handleResizeDown = useCallback((e: PointerEvent, handle: ResizeHandle) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsResizing(true);
    setActiveHandle(handle);
    resizeStartRef.current = {
      px: e.clientX, py: e.clientY,
      x, y, w: width, h: height, handle,
    };
  }, [x, y, width, height]);

  const cursorFor = (h: ResizeHandle): string => {
    switch (h) {
      case "nw": return "nw-resize";
      case "ne": return "ne-resize";
      case "sw": return "sw-resize";
      case "se": return "se-resize";
    }
  };

  const active = isDragging || isResizing;

  return (
    <div
      className="absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        height: `${height}%`,
        border: active
          ? `2px solid ${borderColor}`
          : `2px dashed ${borderColor}`,
        borderRadius: '6px',
        cursor: isDragging ? 'grabbing' : 'grab',
        zIndex,
        touchAction: 'none',
        transition: active ? 'none' : 'border 0.15s, background 0.15s',
        ...overlayStyle,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => setIsHovering(true)}
      onPointerLeave={() => { if (!active) setIsHovering(false); }}
    >
      {/* Children (e.g., subtitle text) */}
      {children}

      {/* Resize handles — visible on hover or during interaction */}
      {(isHovering || active) && (
        <>
          {(["nw", "ne", "sw", "se"] as ResizeHandle[]).map((handle) => (
            <div
              key={handle}
              onPointerDown={(e) => handleResizeDown(e, handle)}
              style={{
                position: 'absolute',
                width: '10px',
                height: '10px',
                background: activeHandle === handle ? borderColor : 'white',
                border: `2px solid ${borderColor}`,
                borderRadius: '2px',
                cursor: cursorFor(handle),
                zIndex: zIndex + 5,
                touchAction: 'none',
                ...(handle.includes('n') ? { top: '-5px' } : { bottom: '-5px' }),
                ...(handle.includes('w') ? { left: '-5px' } : { right: '-5px' }),
              }}
            />
          ))}
        </>
      )}

      {/* Center label — shown on hover when no children */}
      {label && !children && isHovering && !active && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '9px',
            fontWeight: 600,
            color: borderColor,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            opacity: 0.8,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
