import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets scroll position when the route changes.
 *
 * Single-page apps keep the scroll position between pages by default,
 * so navigating from halfway down the job list to About would drop you
 * halfway down About. Browsers do this for you on a normal site; React
 * Router doesn't.
 *
 * Pages with a hash are skipped, so anchor links can handle their own
 * scrolling without this fighting them.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash]);

  return null;
}
