let hideTimer: number | null = null;

export function showVolumeToast(volume: number): void {
  const toast = document.getElementById("volume-toast");
  const fill = document.getElementById("volume-toast-fill");
  const valueEl = document.getElementById("volume-toast-value");
  const iconUse = toast?.querySelector(".center-toast-icon use");
  if (!toast || !fill || !valueEl || !iconUse) return;

  const v = Math.max(0, Math.min(100, Math.round(volume)));
  fill.style.width = `${v}%`;
  valueEl.textContent = String(v);

  let icon = "#icon-volume-high";
  if (v === 0) icon = "#icon-volume-mute";
  else if (v < 30) icon = "#icon-volume-low";
  else if (v < 70) icon = "#icon-volume-mid";
  iconUse.setAttribute("href", icon);

  toast.classList.add("visible");
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    toast.classList.remove("visible");
    hideTimer = null;
  }, 1000);
}
