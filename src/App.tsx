import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { deleteNote, loadNotes, saveNote } from './storage';

type Note = {
  id: string;
  title: string;
  body: string;
  importance: number;
  urgency: number;
  dueDate?: string;
  dueAnchorAt?: number;
  color: string;
  completed: boolean;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type Draft = {
  title: string;
  body: string;
  importance: number;
  urgency: number;
  dueDate: string;
  color: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_URGENCY = 100;
const MIN_URGENCY = 0;
const MAX_IMPORTANCE = 100;
const MIN_IMPORTANCE = 0;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `note-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const getEffectiveUrgency = (note: Note, now: number) => {
  const base = clamp(note.urgency, MIN_URGENCY, MAX_URGENCY);
  if (!note.dueDate) return base;
  const due = new Date(`${note.dueDate}T23:59:59`).getTime();
  if (Number.isNaN(due)) return base;
  if (now >= due) return MAX_URGENCY;
  const anchor = note.dueAnchorAt ?? note.updatedAt ?? note.createdAt;
  const totalMs = Math.max(DAY_MS, due - anchor);
  const progress = clamp((now - anchor) / totalMs, 0, 1);
  return clamp(base + (MAX_URGENCY - base) * progress, MIN_URGENCY, MAX_URGENCY);
};

const getDueLabel = (note: Note, now: number) => {
  if (!note.dueDate) return null;
  const due = new Date(`${note.dueDate}T23:59:59`).getTime();
  if (Number.isNaN(due)) return null;
  const diffDays = Math.ceil((due - now) / DAY_MS);
  if (diffDays >= 0) {
    return `D-${diffDays}`;
  }
  return `D+${Math.abs(diffDays)}`;
};

const colorPalette = [
  { key: 'sunset', label: 'Sunset', hue: 14, baseSat: 48, baseLight: 92 },
  { key: 'saffron', label: 'Saffron', hue: 36, baseSat: 44, baseLight: 92 },
  { key: 'mint', label: 'Mint', hue: 162, baseSat: 38, baseLight: 92 },
  { key: 'sky', label: 'Sky', hue: 198, baseSat: 38, baseLight: 92 },
  { key: 'violet', label: 'Violet', hue: 268, baseSat: 36, baseLight: 92 },
];

const hexToHsl = (hex: string) => {
  const sanitized = hex.replace('#', '');
  if (sanitized.length !== 6) return null;
  const r = parseInt(sanitized.slice(0, 2), 16) / 255;
  const g = parseInt(sanitized.slice(2, 4), 16) / 255;
  const b = parseInt(sanitized.slice(4, 6), 16) / 255;
  if ([r, g, b].some((value) => Number.isNaN(value))) return null;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
};

const urgencyColor = (urgency: number): string => {
  const t = clamp(urgency, MIN_URGENCY, MAX_URGENCY) / MAX_URGENCY;
  const start = { r: 255, g: 255, b: 255 };
  const end = { r: 232, g: 54, b: 46 };
  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);
  return `rgb(${r} ${g} ${b})`;
};

const baseCardColor = (colorValue: string): string => {
  const palette = colorPalette.find((item) => item.key === colorValue);
  if (palette) {
    return `hsl(${palette.hue} ${palette.baseSat}% ${palette.baseLight}%)`;
  }
  const hsl = hexToHsl(colorValue);
  if (!hsl) {
    const fallback = colorPalette[0];
    return `hsl(${fallback.hue} ${fallback.baseSat}% ${fallback.baseLight}%)`;
  }
  return `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`;
};

const defaultDraft: Draft = {
  title: '',
  body: '',
  importance: 60,
  urgency: 40,
  dueDate: '',
  color: colorPalette[0].key,
};

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [now, setNow] = useState(Date.now());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [cardSizes, setCardSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [hoverPlacements, setHoverPlacements] = useState<
    Record<string, { shift: number; place: 'top' | 'bottom' }>
  >({});
  const [listSort, setListSort] = useState('due');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(defaultDraft);
  const [confirmCompleteId, setConfirmCompleteId] = useState<string | null>(null);
  const [confirmCompletePos, setConfirmCompletePos] = useState<{ x: number; y: number } | null>(
    null
  );
  const boardRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const hoverRefs = useRef(new Map<string, HTMLDivElement>());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    let mounted = true;
    loadNotes()
      .then((data) => {
        if (mounted) {
          const normalized = data.map((note) => ({
            ...note,
            color: note.color || colorPalette[0].key,
            completed: note.completed ?? false,
            dueAnchorAt:
              note.dueAnchorAt ??
              (note.dueDate ? note.updatedAt ?? note.createdAt : undefined),
          }));
          setNotes(normalized);
        }
      })
      .catch(() => {
        if (mounted) setNotes([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    resizeObserverRef.current = new ResizeObserver((entries) => {
      setCardSizes((prev) => {
        let changed = false;
        const next = { ...prev };
        entries.forEach((entry) => {
          const target = entry.target as HTMLElement;
          const noteId = target.dataset.noteId;
          if (!noteId) return;
          const width = Math.round(entry.contentRect.width);
          const height = Math.round(entry.contentRect.height);
          const existing = prev[noteId];
          if (!existing || existing.w !== width || existing.h !== height) {
            next[noteId] = { w: width, h: height };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    });
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedId && notes.length > 0) {
      setSelectedId(notes[0].id);
    }
  }, [notes, selectedId]);

  const displayedNotes = useMemo(
    () =>
      notes.map((note) => ({
        ...note,
        color: note.color || colorPalette[0].key,
        effectiveUrgency: getEffectiveUrgency(note, now),
      })),
    [notes, now]
  );

  const editingNote = displayedNotes.find((note) => note.id === editingId) || null;
  const activeNotes = displayedNotes.filter((note) => !note.completed);
  const completedNotes = displayedNotes.filter((note) => note.completed);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) return;
    const timestamp = Date.now();
    const next: Note = {
      id: createId(),
      title: draft.title.trim(),
      body: draft.body.trim(),
      importance: clamp(draft.importance, MIN_IMPORTANCE, MAX_IMPORTANCE),
      urgency: clamp(draft.urgency, MIN_URGENCY, MAX_URGENCY),
      dueDate: draft.dueDate || undefined,
      dueAnchorAt: draft.dueDate ? timestamp : undefined,
      color: draft.color,
      completed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setNotes((prev) => [next, ...prev]);
    setSelectedId(next.id);
    setDraft(defaultDraft);
    await saveNote(next);
  };

  const updateNote = (id: string, updater: (note: Note) => Note) => {
    setNotes((prev) => {
      const next = prev.map((note) => (note.id === id ? updater(note) : note));
      const updated = next.find((note) => note.id === id);
      if (updated) {
        saveNote(updated);
      }
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    setNotes((prev) => prev.filter((note) => note.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
    }
    if (editingId === id) {
      setEditingId(null);
    }
    await deleteNote(id);
  };

  const openEdit = (note: Note) => {
    setEditingId(note.id);
    setEditDraft({
      title: note.title,
      body: note.body,
      importance: note.importance,
      urgency: note.urgency,
      dueDate: note.dueDate || '',
      color: note.color || colorPalette[0].key,
    });
  };

  const commitEdit = () => {
    if (!editingId) return;
    updateNote(editingId, (note) => ({
      ...note,
      title: editDraft.title.trim(),
      body: editDraft.body.trim(),
      dueDate: editDraft.dueDate || undefined,
      dueAnchorAt:
        editDraft.dueDate && editDraft.dueDate !== note.dueDate
          ? Date.now()
          : note.dueAnchorAt,
      color: editDraft.color,
      updatedAt: Date.now(),
    }));
    setEditingId(null);
  };

  const toggleComplete = (id: string, completed: boolean) => {
    updateNote(id, (note) => ({
      ...note,
      completed,
      completedAt: completed ? Date.now() : undefined,
      updatedAt: Date.now(),
    }));
  };

  const updateFromPointer = (clientX: number, clientY: number) => {
    if (!dragId || !boardRef.current) return;
    const note = notes.find((item) => item.id === dragId);
    if (!note) return;
    const rect = boardRef.current.getBoundingClientRect();
    const offsetX = dragOffset?.x ?? 0;
    const offsetY = dragOffset?.y ?? 0;
    const adjustedX = clientX - offsetX;
    const adjustedY = clientY - offsetY;
    const xRatio = clamp((adjustedX - rect.left) / rect.width, 0, 1);
    const yRatio = clamp((adjustedY - rect.top) / rect.height, 0, 1);
    const importance = clamp((1 - xRatio) * 100, MIN_IMPORTANCE, MAX_IMPORTANCE);
    const targetUrgency = clamp((1 - yRatio) * 100, MIN_URGENCY, MAX_URGENCY);
    const urgency = clamp(targetUrgency, MIN_URGENCY, MAX_URGENCY);
    updateNote(dragId, (note) => ({
      ...note,
      importance,
      urgency,
      dueAnchorAt: note.dueDate ? Date.now() : note.dueAnchorAt,
      updatedAt: Date.now(),
    }));
  };

  const registerCard = (id: string) => (element: HTMLDivElement | null) => {
    const map = cardRefs.current;
    const observer = resizeObserverRef.current;
    const existing = map.get(id);
    if (existing && observer) {
      observer.unobserve(existing);
    }
    if (element) {
      element.dataset.noteId = id;
      map.set(id, element);
      observer?.observe(element);
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setCardSizes((prev) => {
        const current = prev[id];
        if (current && current.w === width && current.h === height) return prev;
        return { ...prev, [id]: { w: width, h: height } };
      });
    } else {
      map.delete(id);
    }
  };

  const registerHover = (id: string) => (element: HTMLDivElement | null) => {
    const map = hoverRefs.current;
    if (element) {
      map.set(id, element);
    } else {
      map.delete(id);
    }
  };

  const getClampValue = (percentValue: number, halfSize: number) =>
    `clamp(${halfSize}px, ${percentValue}%, calc(100% - ${halfSize}px))`;

  const updateHoverPlacement = (id: string) => {
    if (!boardRef.current) return;
    const cardEl = cardRefs.current.get(id);
    const hoverEl = hoverRefs.current.get(id);
    if (!cardEl || !hoverEl) return;
    const boardRect = boardRef.current.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    const hoverRect = hoverEl.getBoundingClientRect();
    const padding = 12;
    const desiredLeft = cardRect.left + cardRect.width / 2 - hoverRect.width / 2;
    const minLeft = boardRect.left + padding;
    const maxLeft = boardRect.right - padding - hoverRect.width;
    const clampedLeft = clamp(desiredLeft, minLeft, maxLeft);
    const shift = Math.round(clampedLeft - desiredLeft);
    const topY = cardRect.top - 10 - hoverRect.height;
    const place: 'top' | 'bottom' =
      topY < boardRect.top + padding ? 'bottom' : 'top';
    setHoverPlacements((prev) => {
      const current = prev[id];
      if (current && current.shift === shift && current.place === place) return prev;
      return { ...prev, [id]: { shift, place } };
    });
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="app-eyebrow">Urgent x Important Memo Board</p>
          <h1>Quad-To-Do</h1>
        </div>
        <div className="header-meta">
          <span>Saved locally</span>
          <span className="dot" />
          <span>IndexedDB</span>
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <h2>New Memo</h2>
          <form className="form" onSubmit={handleCreate}>
            <label>
              Title
              <input
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Enter title"
                required
              />
            </label>
            <label>
              Note
              <textarea
                value={draft.body}
                onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
                placeholder="Write your memo"
                rows={4}
              />
            </label>
            <label>
              Due Date
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) => setDraft((prev) => ({ ...prev, dueDate: event.target.value }))}
              />
            </label>
            <div className="palette">
              <p>Card Color</p>
              <div className="palette-row">
                {colorPalette.map((color) => (
                  <button
                    key={color.key}
                    type="button"
                    className={`palette-swatch ${draft.color === color.key ? 'selected' : ''}`}
                    style={{
                      background: `hsl(${color.hue} ${color.baseSat}% ${color.baseLight}%)`,
                    }}
                    onClick={() => setDraft((prev) => ({ ...prev, color: color.key }))}
                    aria-label={color.label}
                  />
                ))}
                <label className="palette-custom">
                  <input
                    type="color"
                    value={
                      draft.color.startsWith('#') ? draft.color : '#f2a48a'
                    }
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, color: event.target.value }))
                    }
                    aria-label="Custom color"
                  />
                </label>
              </div>
            </div>
            <button type="submit">Add Memo</button>
          </form>

          <div className="list-box">
            <div className="list-header">
              <h2>Memo List</h2>
              <select value={listSort} onChange={(event) => setListSort(event.target.value)}>
                <option value="due">Due Date</option>
                <option value="importance">Importance</option>
                <option value="urgency">Urgency</option>
                <option value="created">Created</option>
                <option value="title">Title</option>
              </select>
            </div>
            <div className="list-body">
              {[...displayedNotes]
                .sort((a, b) => {
                  switch (listSort) {
                    case 'importance':
                      return b.importance - a.importance;
                    case 'urgency':
                      return b.effectiveUrgency - a.effectiveUrgency;
                    case 'created':
                      return b.createdAt - a.createdAt;
                    case 'title':
                      return a.title.localeCompare(b.title);
                    case 'due':
                    default: {
                      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
                      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
                      return aTime - bTime;
                    }
                  }
                })
                .map((note) => (
                  <div
                    key={note.id}
                    className={`list-item ${selectedId === note.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedId(note.id);
                      openEdit(note);
                    }}
                  >
                    <span className="list-title">{note.title}</span>
                    <span className="list-meta">
                      {note.completed ? 'Done' : note.dueDate ? note.dueDate : 'No due'}
                    </span>
                    <button
                      type="button"
                      className="list-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(note.id);
                      }}
                      aria-label="Delete memo"
                    >
                      X
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </section>

        <section className="board-section">
          <div className="board-header">
            <h2>Quadrant Board</h2>
            <p>카드를 드래그해서 중요도 / 긴급도를 조정하세요.</p>
          </div>
          <div
            ref={boardRef}
            className="board"
            onPointerMove={(event) => updateFromPointer(event.clientX, event.clientY)}
            onPointerUp={() => {
              setDragId(null);
              setDragOffset(null);
            }}
            onPointerLeave={() => {
              setDragId(null);
              setDragOffset(null);
            }}
          >
            <div className="axis-label axis-top">Urgent &uarr;</div>
            <div className="axis-label axis-left">Important &larr;</div>
            <div className="axis-label axis-right">Less Important &rarr;</div>
            <div className="axis-label axis-bottom">Not Urgent &darr;</div>
            <div className="quadrant-label q1">Do Now</div>
            <div className="quadrant-label q2">Plan</div>
            <div className="quadrant-label q3">Delegate</div>
            <div className="quadrant-label q4">Eliminate</div>

            {activeNotes.map((note) => {
              const urgency = note.effectiveUrgency;
              const x = 100 - clamp(note.importance, MIN_IMPORTANCE, MAX_IMPORTANCE);
              const y = 100 - clamp(urgency, MIN_URGENCY, MAX_URGENCY);
              const dueLabel = getDueLabel(note, now);
              const size = cardSizes[note.id];
              const halfWidth = size ? size.w / 2 : 110;
              const halfHeight = size ? size.h / 2 : 20;
              const hoverPlacement = hoverPlacements[note.id];
              return (
                <article
                  key={note.id}
                  className={`note-card ${selectedId === note.id ? 'selected' : ''}`}
                  ref={registerCard(note.id)}
                  style={{
                    left: getClampValue(x, halfWidth),
                    top: getClampValue(y, halfHeight),
                    background: baseCardColor(note.color),
                  }}
                  onClick={() => setSelectedId(note.id)}
                  onMouseEnter={() => updateHoverPlacement(note.id)}
                  onFocus={() => updateHoverPlacement(note.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setConfirmCompleteId(note.id);
                    const rect = event.currentTarget.getBoundingClientRect();
                    const popWidth = 280;
                    const popHeight = 180;
                    const x = clamp(rect.right + 12, 12, window.innerWidth - popWidth - 12);
                    const y = clamp(
                      rect.top + rect.height / 2 - popHeight / 2,
                      12,
                      window.innerHeight - popHeight - 12
                    );
                    setConfirmCompletePos({ x, y });
                  }}
                  onPointerDown={(event) => {
                    setDragId(note.id);
                    const rect = event.currentTarget.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    setDragOffset({
                      x: event.clientX - centerX,
                      y: event.clientY - centerY,
                    });
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerUp={(event) => {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    setDragId(null);
                    setDragOffset(null);
                  }}
                >
                  <div className="note-title">
                    <span className="urgency-dot" style={{ background: urgencyColor(urgency) }} />
                    <h3>{note.title}</h3>
                    {dueLabel && <span className="badge">{dueLabel}</span>}
                  </div>
                  {note.body && (
                    <div
                      className="note-hover"
                      ref={registerHover(note.id)}
                      style={
                        {
                          '--hover-shift': `${hoverPlacement?.shift ?? 0}px`,
                          '--hover-translate-y': hoverPlacement?.place === 'bottom' ? '4px' : '-4px',
                          top: hoverPlacement?.place === 'bottom' ? 'calc(100% + 10px)' : 'auto',
                          bottom: hoverPlacement?.place === 'bottom' ? 'auto' : 'calc(100% + 10px)',
                        } as React.CSSProperties
                      }
                    >
                      {note.body}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <div className="completed-area">
            <div className="completed-header">
              <h3>Completed</h3>
              <p>우클릭으로 완료 처리된 메모가 여기에 모입니다.</p>
            </div>
            <div className="completed-list">
              {completedNotes.length === 0 && (
                <span className="muted">아직 완료된 메모가 없습니다.</span>
              )}
              {completedNotes.map((note) => (
                <div
                  key={note.id}
                  className="completed-card"
                  style={{ background: baseCardColor(note.color) }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    toggleComplete(note.id, false);
                  }}
                >
                  <span
                    className="urgency-dot"
                    style={{ background: urgencyColor(note.effectiveUrgency) }}
                  />
                  <span className="completed-title">{note.title}</span>
                  {note.completedAt && (
                    <span className="completed-meta">
                      {new Date(note.completedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      {editingNote && (
        <div className="modal-float">
          <div className="modal">
            <div className="modal-header">
              <h2>Edit Memo</h2>
              <button type="button" className="modal-close" onClick={() => setEditingId(null)}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <label>
                Title
                <input
                  value={editDraft.title}
                  onChange={(event) => setEditDraft((prev) => ({ ...prev, title: event.target.value }))}
                />
              </label>
              <label>
                Note
                <textarea
                  value={editDraft.body}
                  onChange={(event) => setEditDraft((prev) => ({ ...prev, body: event.target.value }))}
                  rows={4}
                />
              </label>
              <label>
                Due Date
                <input
                  type="date"
                  value={editDraft.dueDate}
                  onChange={(event) =>
                    setEditDraft((prev) => ({ ...prev, dueDate: event.target.value }))
                  }
                />
              </label>
              <div className="palette">
                <p>Card Color</p>
                <div className="palette-row">
                  {colorPalette.map((color) => (
                    <button
                      key={color.key}
                      type="button"
                      className={`palette-swatch ${editDraft.color === color.key ? 'selected' : ''}`}
                      style={{
                        background: `hsl(${color.hue} ${color.baseSat}% ${color.baseLight}%)`,
                      }}
                      onClick={() => setEditDraft((prev) => ({ ...prev, color: color.key }))}
                      aria-label={color.label}
                    />
                  ))}
                  <label className="palette-custom">
                    <input
                      type="color"
                      value={editDraft.color.startsWith('#') ? editDraft.color : '#f2a48a'}
                      onChange={(event) =>
                        setEditDraft((prev) => ({ ...prev, color: event.target.value }))
                      }
                      aria-label="Custom color"
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={commitEdit}>
                Save Changes
              </button>
              <button type="button" className="danger" onClick={() => handleDelete(editingNote.id)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmCompleteId && confirmCompletePos && (
        <div className="modal-layer" onClick={() => setConfirmCompleteId(null)}>
          <div
            className="modal small popover"
            style={{ left: confirmCompletePos.x, top: confirmCompletePos.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="menu-list">
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  toggleComplete(confirmCompleteId, true);
                  setConfirmCompleteId(null);
                  setConfirmCompletePos(null);
                }}
              >
                완료
              </button>
              <button
                type="button"
                className="menu-item danger"
                onClick={() => {
                  handleDelete(confirmCompleteId);
                  setConfirmCompleteId(null);
                  setConfirmCompletePos(null);
                }}
              >
                삭제
              </button>
              <button
                type="button"
                className="menu-item ghost"
                onClick={() => setConfirmCompleteId(null)}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;


