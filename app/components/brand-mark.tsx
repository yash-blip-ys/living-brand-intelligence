/**
 * Living Brand Intelligence — the mark.
 *
 * One continuous path that folds inward on itself: the outer end is where the
 * founder is now, the inner end is the memory everything is wound around. It
 * reads as a loop (Remember → Challenge → Evolve) and as growth at the same
 * time, and it stays legible at 16px because it is a single stroke plus a dot.
 *
 * The stroke inherits `currentColor`, so the same component works as the app
 * mark, the favicon, and the animated hero.
 */

/** Sampled once at 32x32 and reused at every size; 730 bytes, no runtime math. */
const SPIRAL =
  "M32.0 15.8L34.2 16.1L36.2 16.7L38.2 17.6L40.0 18.7L41.6 20.1L43.0 21.6L44.1 23.3L45.0 25.1L45.7 27.0L46.0 28.9L46.1 30.8L46.0 32.7L45.6 34.6L44.9 36.3L44.1 37.9L43.0 39.4L41.8 40.7L40.4 41.8L38.9 42.7L37.3 43.4L35.7 43.8L34.0 44.0L32.4 44.0L30.8 43.7L29.2 43.3L27.8 42.6L26.5 41.8L25.3 40.8L24.3 39.7L23.5 38.5L22.9 37.2L22.4 35.9L22.2 34.5L22.1 33.1L22.2 31.8L22.5 30.5L23.0 29.3L23.6 28.2L24.3 27.2L25.2 26.3L26.2 25.6L27.2 25.0L28.3 24.6L29.4 24.3L30.4 24.2L31.5 24.2L32.6 24.4L33.5 24.8L34.4 25.2L35.2 25.8L36.0 26.4L36.5 27.1L37.0 27.9L37.4 28.7L37.6 29.5L37.7 30.4L37.7 31.2L37.6 32.0L37.3 32.7L37.0 33.3L36.6 33.9L36.2 34.5L35.7 34.9L35.1 35.2L34.5 35.5L34.0 35.6L33.4 35.7L32.8 35.6L32.3 35.5L31.9 35.4L31.4 35.1L31.1 34.9";

type BrandMarkProps = {
  /** Rendered pixel size of the square viewport. */
  size?: number;
  className?: string;
  /**
   * Traces the path once on mount instead of showing it finished. Used in the
   * hero and in loading states; suppressed under prefers-reduced-motion by CSS.
   */
  trace?: boolean;
  title?: string;
};

export function BrandMark({
  size = 28,
  className,
  trace = false,
  title,
}: BrandMarkProps) {
  return (
    <svg
      /* Cropped to the drawn extent of the path, so a 26px mark reads as a
         26px mark instead of a small shape floating in a square. */
      viewBox="17.2 11.3 34 34"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
    >
      {title ? <title>{title}</title> : null}
      <path
        d={SPIRAL}
        className={trace ? "mark-path mark-path--trace" : "mark-path"}
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      {/* The present moment: where the path begins. */}
      <circle
        cx={32}
        cy={15.8}
        r={3.1}
        fill="currentColor"
        className={trace ? "mark-seed mark-seed--trace" : "mark-seed"}
      />
    </svg>
  );
}

export default BrandMark;
