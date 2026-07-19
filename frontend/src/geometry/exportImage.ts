export interface CaptureBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function captureSvgToPng(
  svgElement: SVGSVGElement,
  filename: string = "capture.png",
  bounds?: CaptureBounds,
): Promise<void> {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  // The active theme is a `dark` class on <html>, but the clone is a detached
  // <svg> with no ancestors, so the `.dark { … }` rules never match. Mirror the
  // class onto the clone root so theme-specific CSS resolves in the Image loader.
  if (document.documentElement.classList.contains("dark")) {
    clone.classList.add("dark");
  }

  // Embed the document's CSS in the SVG clone so CSS variables and Tailwind
  // classes resolve when the SVG is rasterized. We read from document.styleSheets
  // (not just <style> tags): in production the app CSS is served via <link>, and
  // a <style>-only scan would embed nothing, leaving every element to fall back
  // to its default (black) fill. Cross-origin sheets (e.g. web fonts) throw on
  // cssRules access, so we skip those.
  let combinedStyles = "";
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin stylesheet: rules are not readable. Fall back to the raw
      // text if it is an inline <style>, otherwise skip it.
      const ownerText = (sheet.ownerNode as HTMLStyleElement | null)?.textContent;
      if (ownerText) combinedStyles += ownerText + "\n";
      continue;
    }
    for (const rule of Array.from(rules)) {
      combinedStyles += rule.cssText + "\n";
    }
  }

  // Ensure default Tailwind variables are somewhat present if they are on the HTML node
  const rootStyles = window.getComputedStyle(document.documentElement);
  const inlineRootVars = Array.from(rootStyles)
    .filter((key) => key.startsWith("--"))
    .map((key) => `${key}: ${rootStyles.getPropertyValue(key)};`)
    .join(" ");

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const styleNode = document.createElementNS("http://www.w3.org/2000/svg", "style");
  styleNode.textContent = `:root, svg { ${inlineRootVars} }\n` + combinedStyles;
  defs.appendChild(styleNode);
  clone.insertBefore(defs, clone.firstChild);

  // Set explicit width and height if not present
  const rect = svgElement.getBoundingClientRect();
  const fullWidth = rect.width;
  const fullHeight = rect.height;
  clone.setAttribute("width", fullWidth.toString());
  clone.setAttribute("height", fullHeight.toString());
  // Add a white/surface background if it's transparent, using the theme's background color
  const bgColor = rootStyles.getPropertyValue("--color-surface") || "#ffffff";
  const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bgRect.setAttribute("width", "100%");
  bgRect.setAttribute("height", "100%");
  bgRect.setAttribute("fill", bgColor);
  clone.insertBefore(bgRect, clone.firstChild);

  // Serialize the SVG
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  
  // Encode it as a data URL
  const svgDataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get 2d context");

        let drawX = 0;
        let drawY = 0;
        let drawWidth = fullWidth;
        let drawHeight = fullHeight;

        if (bounds) {
          canvas.width = bounds.width;
          canvas.height = bounds.height;
          // Source coordinates
          drawX = -bounds.x;
          drawY = -bounds.y;
        } else {
          canvas.width = fullWidth;
          canvas.height = fullHeight;
        }

        // We want a higher resolution export for crispness (retina display scale)
        const scale = window.devicePixelRatio || 2;
        canvas.width *= scale;
        canvas.height *= scale;
        ctx.scale(scale, scale);

        ctx.drawImage(img, drawX, drawY, fullWidth, fullHeight);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob failed"));
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve();
        }, "image/png");
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = svgDataUrl;
  });
}
