# Implementation Plan: Screenshot Menu

## Goal
Add a new menu for capturing the canvas graphics (Screenshot/Camera) with two options:
1. Capture full graphic.
2. Capture a selected area.

## Steps
1. **Create `CaptureMenu` Component**
   - File: `frontend/src/components/geometry/CaptureMenu.tsx`
   - Role: A dropdown menu triggered by a camera icon.
   - Props: `onCaptureFull: () => void`, `onCaptureArea: () => void`.

2. **Create `CaptureOverlay` Component**
   - File: `frontend/src/components/geometry/CaptureOverlay.tsx`
   - Role: An absolute overlay that captures mouse drag to define a rectangular area.
   - Behavior: When active, renders a dark transparent overlay with a clear "cutout" representing the selected box. On mouse up, fires `onCapture(box)`.

3. **SVG Export Utility**
   - File: `frontend/src/geometry/exportImage.ts`
   - Logic: 
     - Clone the `.coordinate-grid` and drawing elements from `GeometryCanvas`.
     - Embed computed styles or copy CSS classes/variables so it renders correctly natively.
     - Paint to `<canvas>` via `Image`.
     - Crop if an area is selected.
     - Download as PNG.

4. **Integrate into `App.tsx`**
   - Add `captureMode` state (`"none" | "area"`).
   - Add `CaptureMenu` next to `GridMenu` in `toolbarControls`.
   - Render `CaptureOverlay` conditionally above the `GeometryCanvas` when `captureMode === "area"`.
   - Wire the capturing logic.

5. **Test and Verify**
   - Verify that toggling the menu works.
   - Verify that capturing full viewport creates a PNG download.
   - Verify that capturing an area draws a selection box and downloads the cropped PNG.
