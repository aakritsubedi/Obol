import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function useStickyHeading() {
  const headerRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const headingSentinelRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [headingStuck, setHeadingStuck] = useState(false);

  // Measure before the first paint so the sticky heading never renders once
  // with `top: 0` and then jumps below the app bar. Observe only the app bar:
  // the heading deliberately changes height when it sticks, and observing
  // that same element creates a scroll/measurement feedback loop near the
  // sentinel threshold.
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => {
      const nextHeaderHeight = header.offsetHeight;
      setHeaderHeight((current) => (current === nextHeaderHeight ? current : nextHeaderHeight));
      const total = header.offsetHeight + (headingRef.current?.offsetHeight || 0);
      const nextPadding = `${total}px`;
      if (document.documentElement.style.scrollPaddingTop !== nextPadding) {
        document.documentElement.style.scrollPaddingTop = nextPadding;
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => {
      observer.disconnect();
      document.documentElement.style.scrollPaddingTop = "";
    };
  }, []);

  useEffect(() => {
    const sentinel = headingSentinelRef.current;
    if (!sentinel || !headerHeight) return;
    const observer = new IntersectionObserver(([entry]) => setHeadingStuck(!entry.isIntersecting), {
      rootMargin: `-${headerHeight}px 0px 0px 0px`,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [headerHeight]);

  return { headerRef, headingRef, headingSentinelRef, headerHeight, headingStuck };
}
