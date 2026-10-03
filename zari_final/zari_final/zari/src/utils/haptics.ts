// Vibration is gated behind a user gesture and is unsupported on desktop and
// iOS Safari, so every call is fire-and-forget.
export function haptic(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
