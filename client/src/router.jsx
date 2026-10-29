import { useEffect, useState } from 'react';

// Minimal History-API router: real URLs (/story/:id), working back button,
// no extra dependency.
export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  return path;
}

export function navigate(to) {
  if (to === window.location.pathname + window.location.search) return;
  history.pushState({}, '', to);
  dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

export function Link({ href, onClick, children, ...rest }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
