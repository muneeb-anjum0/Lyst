import { useEffect } from "react";

export function useVisualViewportBridge() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;

    function updateViewport() {
      const layoutHeight = root.clientHeight || window.innerHeight;
      const visualHeight = viewport?.height || window.innerHeight;
      const offsetTop = viewport?.offsetTop || 0;
      const keyboardOffset = Math.max(0, layoutHeight - visualHeight - offsetTop);

      root.style.setProperty("--visual-viewport-height", `${Math.round(visualHeight)}px`);
      root.style.setProperty("--visual-viewport-top", `${Math.round(offsetTop)}px`);
      root.style.setProperty("--keyboard-offset", `${Math.round(keyboardOffset)}px`);
      root.classList.toggle("keyboard-open", keyboardOffset > 80);
    }

    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);

    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      root.classList.remove("keyboard-open");
    };
  }, []);
}
