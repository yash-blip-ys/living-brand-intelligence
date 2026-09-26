/**
 * The confirmation mark used wherever an action has visibly landed: an item
 * confirmed, a strategy generated, a revision approved.
 *
 * The tick is drawn rather than printed, so success reads as an event instead
 * of a label swap. Under `prefers-reduced-motion` the CSS override removes the
 * draw and renders the same shape immediately.
 */
export function ConfirmCheck({
  className = "h-3.5 w-3.5",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`${className} check-pop`}
      fill="none"
      aria-hidden
    >
      <path
        d="M2.4 6.3 4.8 8.7 9.6 3.8"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="check-draw"
      />
    </svg>
  );
}

export default ConfirmCheck;
