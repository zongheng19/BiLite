/**
 * Make an element draggable by its handle.
 * The element should be absolutely positioned.
 */
export function makeDraggable(panel: HTMLElement, handle: HTMLElement): void {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.style.cursor = "move";
  handle.style.userSelect = "none";

  handle.addEventListener("mousedown", (e) => {
    // Don't start drag when clicking on buttons inside the handle
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input")) return;

    dragging = true;
    const rect = panel.getBoundingClientRect();
    // Convert any transform-based positioning to absolute left/top so dragging is intuitive
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.transform = "none";

    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    // Clamp to viewport
    const newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, startLeft + dx));
    const newTop = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, startTop + dy));
    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });
}
