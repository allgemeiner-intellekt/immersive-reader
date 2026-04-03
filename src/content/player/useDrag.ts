import { useCallback, useEffect, useRef, useState } from 'react';

export type SnapPosition = 'bottom-center' | 'bottom-left' | 'bottom-right';

interface DragState {
  x: number;
  y: number;
  snap: SnapPosition;
}

const STORAGE_KEY = 'ir-toolbar-position';
const EDGE_MARGIN = 16;

function getDefaultPosition(): DragState {
  return { x: 0, y: 0, snap: 'bottom-center' };
}

function computePositionFromSnap(
  snap: SnapPosition,
  toolbarWidth: number,
  toolbarHeight: number,
): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bottom = vh - toolbarHeight - EDGE_MARGIN;

  switch (snap) {
    case 'bottom-left':
      return { x: EDGE_MARGIN, y: bottom };
    case 'bottom-right':
      return { x: vw - toolbarWidth - EDGE_MARGIN, y: bottom };
    case 'bottom-center':
    default:
      return { x: (vw - toolbarWidth) / 2, y: bottom };
  }
}

function resolveSnap(x: number, toolbarWidth: number): SnapPosition {
  const vw = window.innerWidth;
  const center = (vw - toolbarWidth) / 2;
  const distLeft = Math.abs(x - EDGE_MARGIN);
  const distCenter = Math.abs(x - center);
  const distRight = Math.abs(x - (vw - toolbarWidth - EDGE_MARGIN));

  const min = Math.min(distLeft, distCenter, distRight);
  if (min === distLeft) return 'bottom-left';
  if (min === distRight) return 'bottom-right';
  return 'bottom-center';
}

export function useDrag(toolbarRef: React.RefObject<HTMLDivElement | null>) {
  const [position, setPosition] = useState<DragState>(getDefaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  // Load persisted position
  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const saved = result[STORAGE_KEY] as SnapPosition | undefined;
      if (saved) {
        setPosition((prev) => ({ ...prev, snap: saved }));
      }
    });
  }, []);

  // Compute actual pixel position from snap
  const getStyle = useCallback((): React.CSSProperties => {
    const el = toolbarRef.current;
    const width = el?.offsetWidth ?? 320;

    if (isDragging) {
      return {
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transition: 'none',
        zIndex: 2147483647,
      };
    }

    const height = el?.offsetHeight ?? 48;
    const pos = computePositionFromSnap(position.snap, width, height);
    return {
      position: 'fixed',
      left: `${pos.x}px`,
      top: `${pos.y}px`,
      transition: 'left 0.3s ease, top 0.3s ease',
      zIndex: 2147483647,
    };
  }, [isDragging, position, toolbarRef]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only drag from the toolbar background, not buttons
      if ((e.target as HTMLElement).closest('button, input, select')) return;

      const el = toolbarRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      hasMoved.current = false;
      setIsDragging(true);
      setPosition({ x: rect.left, y: rect.top, snap: position.snap });
      e.preventDefault();
    },
    [toolbarRef, position.snap],
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      hasMoved.current = true;
      setPosition((prev) => ({
        ...prev,
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      }));
    };

    const onMouseUp = () => {
      setIsDragging(false);
      if (hasMoved.current) {
        setPosition((prev) => {
          const el = toolbarRef.current;
          const width = el?.offsetWidth ?? 320;
          const snap = resolveSnap(prev.x, width);
          chrome.storage.local.set({ [STORAGE_KEY]: snap });
          return { ...prev, snap };
        });
      }
    };

    // Attach to window so drag works even if mouse leaves toolbar
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, toolbarRef]);

  // Recompute on window resize
  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => ({ ...prev })); // trigger re-render
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Recompute position when toolbar size changes (e.g. expand/collapse panel)
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el || isDragging) return;

    const observer = new ResizeObserver(() => {
      setPosition((prev) => ({ ...prev })); // trigger re-render with fresh offsetHeight
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [toolbarRef, isDragging]);

  return { getStyle, onMouseDown, isDragging };
}
