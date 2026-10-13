// After a failed submit, scroll to (and focus) the topmost invalid field inside the open modal.
// DOM order is top-to-bottom, so the first match is always the highest-priority one.
const ERROR_SELECTOR = "input[class*='--error'], select[class*='--error'], textarea[class*='--error'], [class*='--error'] input";

export function focusFirstError(modalSelector) {
  // Wait for the render that paints the error classes.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const modal = document.querySelector(modalSelector);
    const target = modal?.querySelector(ERROR_SELECTOR);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
  }));
}
