/**
 * The member app's launch images on iPhone. Opened from the home screen, iOS
 * shows `apple-touch-startup-image` while the page loads; without one it shows
 * a blank screen. Each image is the paper with the finished RIVET mark exactly
 * where the page's own opening curtain draws it (`WorkspaceCurtain` with
 * `launch`): 3.5rem tall, centred in the area below the status bar, which the
 * page does not cover with `statusBarStyle: "default"`. So the phone's image
 * hands over to the page without the mark moving, and the mark then starts to
 * lift while RIVET finds the member.
 *
 * Images are drawn by `scripts/generate-launch-images.mjs` into
 * `public/launch/`. No imports: Node reads this file directly.
 */

export interface LaunchScreen {
  /** CSS pixels, portrait. */
  width: number;
  height: number;
  pixelRatio: 2 | 3;
  /** The status bar the page sits below (the device's top safe area), in CSS pixels. */
  statusBar: number;
  /** For people reading this list. */
  devices: string;
}

/** Current iPhones and the ones still in wide use; the member app is portrait only. */
export const LAUNCH_SCREENS: readonly LaunchScreen[] = [
  { width: 440, height: 956, pixelRatio: 3, statusBar: 62, devices: "iPhone 16 Pro Max, 17 Pro Max" },
  { width: 420, height: 912, pixelRatio: 3, statusBar: 68, devices: "iPhone Air" },
  { width: 402, height: 874, pixelRatio: 3, statusBar: 62, devices: "iPhone 16 Pro, 17, 17 Pro" },
  { width: 430, height: 932, pixelRatio: 3, statusBar: 59, devices: "iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus" },
  { width: 393, height: 852, pixelRatio: 3, statusBar: 59, devices: "iPhone 14 Pro, 15, 15 Pro, 16" },
  { width: 428, height: 926, pixelRatio: 3, statusBar: 47, devices: "iPhone 12 Pro Max, 13 Pro Max, 14 Plus" },
  { width: 390, height: 844, pixelRatio: 3, statusBar: 47, devices: "iPhone 12, 12 Pro, 13, 13 Pro, 14, 16e" },
  { width: 375, height: 812, pixelRatio: 3, statusBar: 47, devices: "iPhone X, XS, 11 Pro, 12 mini, 13 mini" },
  { width: 414, height: 896, pixelRatio: 3, statusBar: 44, devices: "iPhone XS Max, 11 Pro Max" },
  { width: 414, height: 896, pixelRatio: 2, statusBar: 48, devices: "iPhone XR, 11" },
  { width: 414, height: 736, pixelRatio: 3, statusBar: 20, devices: "iPhone 6s Plus, 7 Plus, 8 Plus" },
  { width: 375, height: 667, pixelRatio: 2, statusBar: 20, devices: "iPhone SE (2nd and 3rd), 6s, 7, 8" },
];

/** The opening curtain's mark: `h-14` (3.5rem). */
export const LAUNCH_MARK_HEIGHT = 56;
export const LAUNCH_PAPER = "#f5f4ef";
export const LAUNCH_INK = "#1b1a15";
export const LAUNCH_SIGNAL = "#d9232b";

export function launchImagePath(screen: LaunchScreen): string {
  return `/launch/iphone-${screen.width}x${screen.height}@${screen.pixelRatio}x.png`;
}

export function launchImageMedia(screen: LaunchScreen): string {
  return `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.pixelRatio}) and (orientation: portrait)`;
}

/** Where the mark's centre falls, in CSS pixels from the top-left of the screen. */
export function launchMarkCentre(screen: LaunchScreen): { x: number; y: number } {
  return { x: screen.width / 2, y: screen.statusBar + (screen.height - screen.statusBar) / 2 };
}

/** For `metadata.appleWebApp.startupImage` on the pages that offer the member app. */
export const LAUNCH_STARTUP_IMAGES = LAUNCH_SCREENS.map((screen) => ({ url: launchImagePath(screen), media: launchImageMedia(screen) }));
