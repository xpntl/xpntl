// apps/web/src/components/IssueRefHoverLayer.tsx
//
// Sits alongside the TipTap editor/renderer and listens for mouse events
// on issue-ref links (a[data-issue-ref]). Shows the IssueRefHoverCard on
// hover with debounce to avoid spam. Handles React Router navigation on click.

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IssueRefHoverCard } from './IssueRefHoverCard';

interface IssueRefHoverLayerProps {
  children: ReactNode;
}

export function IssueRefHoverLayer({ children }: IssueRefHoverLayerProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ key: string; rect: DOMRect } | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Click handler: intercept clicks on issue-ref links for React Router nav
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a[data-issue-ref]') as HTMLAnchorElement | null;
      if (!target) return;

      e.preventDefault();
      e.stopPropagation();
      const href = target.getAttribute('href');
      if (href) navigate(href);
    };

    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [navigate]);

  // Hover handler: show card after short delay
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a[data-issue-ref]') as HTMLAnchorElement | null;
      if (!target) return;

      // Clear any pending leave timeout
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
        leaveTimeoutRef.current = null;
      }

      const issueKey = target.getAttribute('data-issue-key');
      if (!issueKey) return;

      // Debounce hover to 300ms
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(() => {
        const rect = target.getBoundingClientRect();
        setHover({ key: issueKey, rect });
      }, 300);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a[data-issue-ref]');
      if (!target) return;

      // Clear pending hover
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }

      // Delay close so user can move to the card
      leaveTimeoutRef.current = setTimeout(() => {
        setHover(null);
      }, 200);
    };

    el.addEventListener('mouseover', handleMouseOver);
    el.addEventListener('mouseout', handleMouseOut);
    return () => {
      el.removeEventListener('mouseover', handleMouseOver);
      el.removeEventListener('mouseout', handleMouseOut);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  const handleCardClose = useCallback(() => {
    setHover(null);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {children}
      {hover && (
        <IssueRefHoverCard
          issueKey={hover.key}
          anchorRect={hover.rect}
          onClose={handleCardClose}
        />
      )}
    </div>
  );
}
