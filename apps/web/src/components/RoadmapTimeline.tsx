import { IssueKey, Priority, StateDot, type WorkflowState as StateKind } from '@xpntl/ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Issue, WorkflowState, WorkspaceUser } from '../lib/api';
import { priorityKind } from '../lib/format';

interface RoadmapTimelineProps {
  issues: Issue[];
  states: WorkflowState[];
  stateById: Map<string, WorkflowState>;
  usersById: Record<string, WorkspaceUser>;
  onPatch: (issueId: string, patch: Partial<Issue>) => void;
}

const ROW_H = 36;
const HEADER_H = 32;
const LABEL_W = 260;
const DAY_W = 32;
const MIN_BAR_DAYS = 1;
const UNSCHEDULED_LABEL = 'Unscheduled';

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function toISODate(d: Date): string {
  return d.toISOString();
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en', { month: 'short', year: '2-digit' });
}

export function RoadmapTimeline({
  issues,
  states,
  stateById,
  usersById,
  onPatch,
}: RoadmapTimelineProps) {
  const navigate = useNavigate();

  const scheduled = useMemo(
    () => issues.filter((i) => i.startDate || i.dueDate),
    [issues],
  );
  const unscheduled = useMemo(
    () => issues.filter((i) => !i.startDate && !i.dueDate),
    [issues],
  );

  const today = useMemo(() => startOfDay(new Date()), []);

  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    if (scheduled.length === 0) {
      const s = addDays(today, -14);
      const e = addDays(today, 60);
      return { timelineStart: s, timelineEnd: e, totalDays: diffDays(s, e) };
    }
    let earliest = today;
    let latest = today;
    for (const issue of scheduled) {
      const s = issue.startDate ? startOfDay(new Date(issue.startDate)) : null;
      const e = issue.dueDate ? startOfDay(new Date(issue.dueDate)) : null;
      const lo = s ?? e!;
      const hi = e ?? s!;
      if (lo < earliest) earliest = lo;
      if (hi > latest) latest = hi;
    }
    const s = addDays(earliest, -14);
    const e = addDays(latest, 30);
    return { timelineStart: s, timelineEnd: e, totalDays: diffDays(s, e) };
  }, [scheduled, today]);

  const months = useMemo(() => {
    const result: Array<{ label: string; offsetDays: number; widthDays: number }> = [];
    let cursor = new Date(timelineStart);
    cursor.setDate(1);
    if (cursor < timelineStart) {
      cursor.setMonth(cursor.getMonth() + 1);
    }
    while (cursor <= timelineEnd) {
      const nextMonth = new Date(cursor);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const start = cursor < timelineStart ? timelineStart : cursor;
      const end = nextMonth > timelineEnd ? timelineEnd : nextMonth;
      result.push({
        label: monthLabel(cursor),
        offsetDays: diffDays(timelineStart, start),
        widthDays: diffDays(start, end),
      });
      cursor = nextMonth;
    }
    return result;
  }, [timelineStart, timelineEnd]);

  const todayOffset = diffDays(timelineStart, today);
  const timelineW = totalDays * DAY_W;

  const [dragging, setDragging] = useState<{
    issueId: string;
    edge: 'start' | 'end' | 'bar';
    originX: number;
    origStart: Date;
    origEnd: Date;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, issue: Issue, edge: 'start' | 'end' | 'bar') => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const s = issue.startDate ? startOfDay(new Date(issue.startDate)) : today;
      const d = issue.dueDate ? startOfDay(new Date(issue.dueDate)) : addDays(s, 7);
      setDragging({
        issueId: issue.id,
        edge,
        originX: e.clientX,
        origStart: s,
        origEnd: d,
      });
    },
    [today],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - dragging.originX;
      const dayDelta = Math.round(dx / DAY_W);
      if (dayDelta === 0) return;

      let newStart = dragging.origStart;
      let newEnd = dragging.origEnd;

      if (dragging.edge === 'bar') {
        newStart = addDays(dragging.origStart, dayDelta);
        newEnd = addDays(dragging.origEnd, dayDelta);
      } else if (dragging.edge === 'start') {
        newStart = addDays(dragging.origStart, dayDelta);
        if (newStart >= newEnd) newStart = addDays(newEnd, -MIN_BAR_DAYS);
      } else {
        newEnd = addDays(dragging.origEnd, dayDelta);
        if (newEnd <= newStart) newEnd = addDays(newStart, MIN_BAR_DAYS);
      }

      onPatch(dragging.issueId, {
        startDate: toISODate(newStart),
        dueDate: toISODate(newEnd),
      });
    },
    [dragging, onPatch],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  const [showUnscheduled, setShowUnscheduled] = useState(true);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        fontFamily: 'var(--xp-font-mono)',
        fontSize: 12,
      }}
    >
      {/* Timeline area */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left labels */}
        <div
          style={{
            width: LABEL_W,
            flexShrink: 0,
            borderRight: '1px solid var(--xp-border)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              height: HEADER_H,
              borderBottom: '1px solid var(--xp-hairline)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
            }}
          >
            <span className="xp-meta">ISSUE</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {scheduled.map((issue) => {
              const state = stateById.get(issue.stateId);
              return (
                <div
                  key={issue.id}
                  style={{
                    height: ROW_H,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 12px',
                    borderBottom: '1px solid var(--xp-hairline)',
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate(`/issues/${encodeURIComponent(issue.key)}`)}
                >
                  <StateDot kind={(state?.type ?? 'backlog') as StateKind} size={12} />
                  <Priority kind={priorityKind(issue.priority)} size={12} />
                  <IssueKey size="sm">{issue.key}</IssueKey>
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--xp-ink)',
                    }}
                  >
                    {issue.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right timeline */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowX: 'auto',
            overflowY: 'auto',
            position: 'relative',
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(e) => {
            e.preventDefault();
            const issueId = e.dataTransfer.getData('application/x-issue-id');
            if (!issueId || !scrollRef.current) return;
            const rect = scrollRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
            const dayOffset = Math.round(x / DAY_W);
            const dropDate = addDays(timelineStart, dayOffset);
            onPatch(issueId, {
              startDate: toISODate(dropDate),
              dueDate: toISODate(addDays(dropDate, 7)),
            });
          }}
        >
          {/* Month header */}
          <div
            style={{
              height: HEADER_H,
              width: timelineW,
              position: 'sticky',
              top: 0,
              zIndex: 2,
              borderBottom: '1px solid var(--xp-hairline)',
              background: 'var(--xp-surface)',
              display: 'flex',
            }}
          >
            {months.map((m, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: m.offsetDays * DAY_W,
                  width: m.widthDays * DAY_W,
                  height: HEADER_H,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 8px',
                  borderLeft: '1px solid var(--xp-hairline)',
                }}
              >
                <span className="xp-meta">{m.label.toUpperCase()}</span>
              </div>
            ))}
          </div>

          {/* Today marker */}
          {todayOffset >= 0 && todayOffset <= totalDays && (
            <div
              style={{
                position: 'absolute',
                left: todayOffset * DAY_W,
                top: 0,
                bottom: 0,
                width: 1,
                background: 'var(--xp-accent-strong)',
                zIndex: 3,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Issue bars */}
          <div style={{ width: timelineW, position: 'relative' }}>
            {scheduled.map((issue, idx) => {
              const s = issue.startDate
                ? startOfDay(new Date(issue.startDate))
                : issue.dueDate
                  ? addDays(startOfDay(new Date(issue.dueDate)), -7)
                  : today;
              const e = issue.dueDate
                ? startOfDay(new Date(issue.dueDate))
                : addDays(s, 7);
              const left = diffDays(timelineStart, s) * DAY_W;
              const width = Math.max(diffDays(s, e), MIN_BAR_DAYS) * DAY_W;
              const state = stateById.get(issue.stateId);
              const isDragging = dragging?.issueId === issue.id;

              return (
                <div
                  key={issue.id}
                  style={{
                    position: 'absolute',
                    top: idx * ROW_H + 6,
                    left,
                    width,
                    height: ROW_H - 12,
                    borderRadius: 'var(--xp-r-sm)',
                    background: barColor(state?.type),
                    opacity: isDragging ? 0.85 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'grab',
                    userSelect: 'none',
                    transition: isDragging ? 'none' : 'left 0.15s ease, width 0.15s ease',
                    overflow: 'hidden',
                  }}
                >
                  {/* Start drag handle */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 6,
                      cursor: 'col-resize',
                      zIndex: 1,
                    }}
                    onPointerDown={(ev) => handlePointerDown(ev, issue, 'start')}
                  />
                  {/* Bar body */}
                  <div
                    style={{
                      flex: 1,
                      padding: '0 8px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'var(--xp-canvas)',
                    }}
                    onPointerDown={(ev) => handlePointerDown(ev, issue, 'bar')}
                  >
                    {issue.key}
                  </div>
                  {/* End drag handle */}
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 6,
                      cursor: 'col-resize',
                      zIndex: 1,
                    }}
                    onPointerDown={(ev) => handlePointerDown(ev, issue, 'end')}
                  />
                </div>
              );
            })}
            {/* Spacer for rows */}
            <div style={{ height: scheduled.length * ROW_H }} />
          </div>
        </div>
      </div>

      {/* Unscheduled section */}
      {unscheduled.length > 0 && (
        <div
          style={{
            borderTop: '1px solid var(--xp-border)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setShowUnscheduled((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '6px 12px',
              background: 'var(--xp-surface)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--xp-font-mono)',
              fontSize: 11,
              color: 'var(--xp-muted)',
              textAlign: 'left',
            }}
          >
            <span style={{ transform: showUnscheduled ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
              ▸
            </span>
            <span className="xp-meta">{UNSCHEDULED_LABEL.toUpperCase()}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{unscheduled.length}</span>
          </button>
          {showUnscheduled && (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {unscheduled.map((issue) => {
                const state = stateById.get(issue.stateId);
                return (
                  <div
                    key={issue.id}
                    style={{
                      height: ROW_H,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0 12px',
                      borderTop: '1px solid var(--xp-hairline)',
                      cursor: 'pointer',
                    }}
                    onClick={() => navigate(`/issues/${encodeURIComponent(issue.key)}`)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-issue-id', issue.id);
                    }}
                  >
                    <StateDot kind={(state?.type ?? 'backlog') as StateKind} size={12} />
                    <Priority kind={priorityKind(issue.priority)} size={12} />
                    <IssueKey size="sm">{issue.key}</IssueKey>
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--xp-ink)',
                      }}
                    >
                      {issue.title}
                    </span>
                    <span style={{ color: 'var(--xp-faint)', fontSize: 10 }}>
                      drag to schedule
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function barColor(stateType?: string): string {
  switch (stateType) {
    case 'completed':
      return 'oklch(0.55 0.15 145)';
    case 'started':
      return 'var(--xp-accent-strong)';
    case 'canceled':
      return 'oklch(0.55 0.05 30)';
    case 'triage':
      return 'oklch(0.6 0.12 30)';
    case 'backlog':
      return 'oklch(0.55 0.06 260)';
    default:
      return 'oklch(0.5 0.08 260)';
  }
}
