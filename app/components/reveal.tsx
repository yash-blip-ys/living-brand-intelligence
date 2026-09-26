"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

/**
 * Reveals its children once, when they first reach the viewport.
 *
 * The shown flag is written straight to the DOM attribute instead of into
 * React state: the reveal needs to change one attribute and nothing else, and
 * a state update here would re-render the whole revealed subtree. Elements
 * unobserve themselves as soon as they are shown, so scrolling back up never
 * replays the motion.
 *
 * Content is always in the DOM. Under `prefers-reduced-motion` the CSS
 * override keeps it fully visible, and a no-JS fallback lives in the layout.
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  eager = false,
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  /** Stagger inside a group, in milliseconds. */
  delay?: number;
  /**
   * For content that is already on screen: it is server-rendered visible, so
   * the first paint never waits on hydration. The observer is skipped because
   * there is nothing left to reveal.
   */
  eager?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || eager) return;
    const show = () => {
      node.setAttribute("data-shown", "true");
    };
    if (typeof IntersectionObserver === "undefined") {
      show();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            show();
            observer.disconnect();
          }
        }
      },
      // Bottom-biased root margin: content starts revealing slightly before it
      // is fully on screen, which is what makes it feel responsive.
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [eager]);

  return (
    <Tag
      ref={ref}
      className={`reveal${className ? ` ${className}` : ""}`}
      data-shown={eager ? "true" : "false"}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
