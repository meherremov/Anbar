import { useEffect, useRef } from 'react';
import type { BarcodeScanResult } from '../types/inventory';

interface GlobalBarcodeListenerProps {
  enabled: boolean;
  onScan: (result: BarcodeScanResult) => void;
}

const MIN_BARCODE_LENGTH = 4;
const MAX_CHAR_INTERVAL_MS = 100;
const MAX_TERMINATOR_INTERVAL_MS = 180;
const BUFFER_IDLE_TIMEOUT_MS = 240;

const MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Dead',
  'Unidentified',
]);

/**
 * Global keyboard-wedge listener for physical USB and Bluetooth HID barcode scanners.
 * Captures rapid scanner keystrokes ending with Enter/Tab across the app without
 * interfering with normal typing inside text inputs or textareas.
 */
export function GlobalBarcodeListener({
  enabled,
  onScan,
}: GlobalBarcodeListenerProps) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = '';
    let lastKeyTime = 0;
    let idleTimer: number | null = null;

    const resetBuffer = () => {
      buffer = '';
      lastKeyTime = 0;
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (MODIFIER_KEYS.has(e.key)) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        resetBuffer();
        return;
      }

      const now = performance.now();

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (
          buffer.length >= MIN_BARCODE_LENGTH &&
          now - lastKeyTime <= MAX_TERMINATOR_INTERVAL_MS
        ) {
          e.preventDefault();
          e.stopPropagation();
          const code = buffer.trim();
          resetBuffer();
          if (code) {
            onScanRef.current({ code, format: 'USB_BT_SCANNER' });
          }
        } else {
          resetBuffer();
        }
        return;
      }

      if (e.key.length === 1) {
        if (now - lastKeyTime > MAX_CHAR_INTERVAL_MS) {
          buffer = e.key;
        } else {
          buffer += e.key;
        }
        lastKeyTime = now;

        if (idleTimer !== null) {
          window.clearTimeout(idleTimer);
        }
        idleTimer = window.setTimeout(resetBuffer, BUFFER_IDLE_TIMEOUT_MS);
      } else {
        resetBuffer();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      resetBuffer();
    };
  }, [enabled]);

  return null;
}
