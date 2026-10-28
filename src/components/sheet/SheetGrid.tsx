import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Copy, Download, Filter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clamp,
  navigate,
  normalizeRange,
  parseFilter,
  parseTsv,
  rangeStats,
  sortRows,
  toCsv,
  toTsv,
  type CellPos,
  type CellRange,
  type CellValue,
  type SortState,
} from "./sheetModel";

export interface SheetColumn<T> {
  id: string;
  header: string;
  width: number;
  align?: "left" | "right";
  /** Raw value: used for sorting, filtering, copy and export. */
  value: (row: T) => CellValue;
  /** Optional richer rendering; the raw value is shown when omitted. */
  display?: (row: T) => ReactNode;
  editable?: boolean;
}

interface SheetGridProps<T> {
  rows: T[];
  columns: SheetColumn<T>[];
  getRowId: (row: T) => string;
  /** Apply an edit. Throw an Error to reject it; the message is shown to the user. */
  onEdit?: (row: T, columnId: string, text: string) => Promise<void> | void;
  onError?: (message: string) => void;
  rowClassName?: (row: T) => string | undefined;
  exportName: string;
  toolbar?: ReactNode;
  footer?: (visibleRows: T[]) => ReactNode;
  emptyMessage?: string;
  className?: string;
}

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 34;
const FILTER_HEIGHT = 32;
const GUTTER_WIDTH = 48;
const MIN_COLUMN_WIDTH = 60;
const UNDO_LIMIT = 50;

const asText = (value: CellValue) => (value === null || value === undefined ? "" : String(value));

interface UndoEntry {
  rowId: string;
  columnId: string;
  before: string;
  after: string;
}

function SheetGrid<T>({
  rows,
  columns,
  getRowId,
  onEdit,
  onError,
  rowClassName,
  exportName,
  toolbar,
  footer,
  emptyMessage = "No rows to show",
  className,
}: SheetGridProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const undoStack = useRef<UndoEntry[]>([]);

  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [quick, setQuick] = useState("");
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [active, setActive] = useState<CellPos>({ row: 0, col: 0 });
  const [range, setRange] = useState<CellRange>({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } });
  const [editing, setEditingState] = useState<{ pos: CellPos; draft: string } | null>(null);
  // Mirrors `editing` so a commit or cancel can only ever happen once, even though
  // moving focus away from the input fires a blur handler holding stale state.
  const editingRef = useRef<{ pos: CellPos; draft: string } | null>(null);
  const setEditing = useCallback((next: { pos: CellPos; draft: string } | null) => {
    editingRef.current = next;
    setEditingState(next);
  }, []);

  const colWidth = useCallback(
    (column: SheetColumn<T>) => Math.max(widths[column.id] ?? column.width, MIN_COLUMN_WIDTH),
    [widths],
  );

  const view = useMemo(() => {
    const predicates = columns
      .map((column) => ({ column, test: parseFilter(filters[column.id] ?? "") }))
      .filter((entry) => (filters[entry.column.id] ?? "").trim() !== "");
    const needle = quick.trim().toLowerCase();

    let result = rows.filter((row) => {
      if (needle && !columns.some((column) => asText(column.value(row)).toLowerCase().includes(needle))) return false;
      return predicates.every(({ column, test }) => test(column.value(row)));
    });

    if (sort) {
      const column = columns.find((c) => c.id === sort.columnId);
      if (column) result = sortRows(result, column.value, sort.dir);
    }
    return result;
  }, [rows, columns, filters, quick, sort]);

  const size = { rows: view.length, cols: columns.length };
  const totalWidth = GUTTER_WIDTH + columns.reduce((sum, column) => sum + colWidth(column), 0);
  const activeFilterCount = Object.values(filters).filter((f) => f.trim()).length + (quick.trim() ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: view.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 14,
    // Render a full screenful on the very first frame instead of waiting for measurement.
    initialRect: { width: 1200, height: 720 },
  });

  // Keep the cursor inside the data when filtering shrinks it.
  useEffect(() => {
    const lastRow = Math.max(view.length - 1, 0);
    setActive((current) => (current.row > lastRow ? { ...current, row: lastRow } : current));
    setRange((current) => ({
      anchor: { ...current.anchor, row: Math.min(current.anchor.row, lastRow) },
      focus: { ...current.focus, row: Math.min(current.focus.row, lastRow) },
    }));
  }, [view.length]);

  useEffect(() => {
    if (view.length > 0) virtualizer.scrollToIndex(clamp(active.row, 0, view.length - 1), { align: "auto" });
    const cell = containerRef.current?.querySelector<HTMLElement>(`[data-cell="${active.row}:${active.col}"]`);
    cell?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.row, active.col]);

  useEffect(() => {
    const stopDrag = () => {
      dragging.current = false;
    };
    window.addEventListener("mouseup", stopDrag);
    return () => window.removeEventListener("mouseup", stopDrag);
  }, []);

  const selection = normalizeRange(range);
  const inSelection = (row: number, col: number) =>
    row >= selection.top && row <= selection.bottom && col >= selection.left && col <= selection.right;

  const moveTo = useCallback((pos: CellPos, extend: boolean) => {
    setActive(pos);
    setRange((current) => (extend ? { anchor: current.anchor, focus: pos } : { anchor: pos, focus: pos }));
  }, []);

  const reportError = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "That change could not be saved";
      onError?.(message);
    },
    [onError],
  );

  const applyEdit = useCallback(
    async (row: T, columnId: string, text: string, record = true): Promise<boolean> => {
      const column = columns.find((c) => c.id === columnId);
      if (!column?.editable || !onEdit) return false;
      const before = asText(column.value(row));
      if (before === text) return true;
      try {
        await onEdit(row, columnId, text);
        if (record) {
          undoStack.current.push({ rowId: getRowId(row), columnId, before, after: text });
          if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
        }
        return true;
      } catch (error) {
        reportError(error);
        return false;
      }
    },
    [columns, onEdit, getRowId, reportError],
  );

  const startEditing = (pos: CellPos, initial?: string) => {
    const row = view[pos.row];
    const column = columns[pos.col];
    if (!row || !column?.editable || !onEdit) return;
    setEditing({ pos, draft: initial ?? asText(column.value(row)) });
  };

  const cancelEdit = () => {
    setEditing(null);
    containerRef.current?.focus();
  };

  const commitEdit = async (move: "down" | "up" | "right" | "none") => {
    const current = editingRef.current;
    if (!current) return;
    const { pos, draft } = current;
    const row = view[pos.row];
    setEditing(null);
    containerRef.current?.focus();
    if (row) await applyEdit(row, columns[pos.col].id, draft);
    if (move === "down") moveTo({ row: clamp(pos.row + 1, 0, size.rows - 1), col: pos.col }, false);
    if (move === "up") moveTo({ row: clamp(pos.row - 1, 0, size.rows - 1), col: pos.col }, false);
    if (move === "right") moveTo({ row: pos.row, col: clamp(pos.col + 1, 0, size.cols - 1) }, false);
  };

  const selectedValues = useCallback(
    () =>
      view
        .slice(selection.top, selection.bottom + 1)
        .map((row) => columns.slice(selection.left, selection.right + 1).map((column) => column.value(row))),
    [view, columns, selection.top, selection.bottom, selection.left, selection.right],
  );

  const fillRange = async (text: string | null) => {
    const targets = view.slice(selection.top, selection.bottom + 1);
    for (const row of targets) {
      for (const column of columns.slice(selection.left, selection.right + 1)) {
        if (column.editable) await applyEdit(row, column.id, text ?? "");
      }
    }
  };

  const undo = async () => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    const row = rows.find((candidate) => getRowId(candidate) === entry.rowId);
    if (row) await applyEdit(row, entry.columnId, entry.before, false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;

    if (mod && key.toLowerCase() === "a") {
      event.preventDefault();
      setRange({ anchor: { row: 0, col: 0 }, focus: { row: size.rows - 1, col: size.cols - 1 } });
      return;
    }
    if (mod && key.toLowerCase() === "d") {
      event.preventDefault();
      const source = view[selection.top];
      if (!source) return;
      void (async () => {
        for (const row of view.slice(selection.top + 1, selection.bottom + 1)) {
          for (const column of columns.slice(selection.left, selection.right + 1)) {
            if (column.editable) await applyEdit(row, column.id, asText(column.value(source)));
          }
        }
      })();
      return;
    }
    if (mod && key.toLowerCase() === "z") {
      event.preventDefault();
      void undo();
      return;
    }
    if (mod) return; // let copy / paste / everything else through to the browser events

    if (key === "Enter" || key === "F2") {
      event.preventDefault();
      if (columns[active.col]?.editable && onEdit) startEditing(active);
      else if (key === "Enter") moveTo(navigate("ArrowDown", active, size) ?? active, false);
      return;
    }
    if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      void fillRange(null);
      return;
    }
    if (key === "Escape") {
      setRange({ anchor: active, focus: active });
      return;
    }

    const next = navigate(key, active, size, { ctrl: false, shift: event.shiftKey, page: Math.max(Math.floor((scrollRef.current?.clientHeight ?? 320) / ROW_HEIGHT) - 2, 1) });
    if (next) {
      event.preventDefault();
      moveTo(next, event.shiftKey && key !== "Tab");
      return;
    }

    // Typing on a cell starts editing it, replacing the old content (like Excel).
    if (key.length === 1 && !event.altKey && columns[active.col]?.editable && onEdit) {
      event.preventDefault();
      startEditing(active, key);
    }
  };

  const onCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    if (editing) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", toTsv(selectedValues().map((line) => line.map(asText))));
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (editing || !onEdit) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const pasted = parseTsv(text);
    if (pasted.length === 0) return;

    void (async () => {
      const single = pasted.length === 1 && pasted[0].length === 1;
      const multiCellSelection = selection.bottom > selection.top || selection.right > selection.left;
      if (single && multiCellSelection) {
        await fillRange(pasted[0][0]);
        return;
      }
      // Snapshot target rows first: editing a sorted column can reorder the view mid-paste.
      const targets = view.slice(active.row, active.row + pasted.length);
      for (let r = 0; r < targets.length; r += 1) {
        for (let c = 0; c < pasted[r].length; c += 1) {
          const column = columns[active.col + c];
          if (!column) break;
          if (column.editable && !(await applyEdit(targets[r], column.id, pasted[r][c]))) return;
        }
      }
      setRange({
        anchor: active,
        focus: {
          row: clamp(active.row + pasted.length - 1, 0, size.rows - 1),
          col: clamp(active.col + Math.max(...pasted.map((line) => line.length)) - 1, 0, size.cols - 1),
        },
      });
    })();
  };

  const cellMouseDown = (event: MouseEvent, pos: CellPos) => {
    if (event.button !== 0) return;
    containerRef.current?.focus();
    dragging.current = true;
    if (event.shiftKey) {
      setRange((current) => ({ anchor: current.anchor, focus: pos }));
      setActive(pos);
    } else {
      moveTo(pos, false);
    }
  };

  const cellMouseEnter = (pos: CellPos) => {
    if (dragging.current) setRange((current) => ({ anchor: current.anchor, focus: pos }));
  };

  const toggleSort = (columnId: string) =>
    setSort((current) => {
      if (current?.columnId !== columnId) return { columnId, dir: "asc" };
      return current.dir === "asc" ? { columnId, dir: "desc" } : null;
    });

  const startResize = (event: MouseEvent, column: SheetColumn<T>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = colWidth(column);
    const onMove = (move: globalThis.MouseEvent) =>
      setWidths((current) => ({ ...current, [column.id]: Math.max(startWidth + move.clientX - startX, MIN_COLUMN_WIDTH) }));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const exportCsv = () => {
    const csv = toCsv(
      columns.map((column) => column.header),
      view.map((row) => columns.map((column) => asText(column.value(row)))),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copySelection = () => {
    const text = toTsv(selectedValues().map((line) => line.map(asText)));
    void navigator.clipboard?.writeText(text);
  };

  const stats = useMemo(() => {
    const values = selectedValues().flat();
    return values.length > 1 ? rangeStats(values) : null;
  }, [selectedValues]);

  const items = virtualizer.getVirtualItems();

  return (
    <div className={`flex min-h-0 min-w-0 max-w-full flex-col rounded-lg border border-border bg-card ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={quick}
            onChange={(event) => setQuick(event.target.value)}
            placeholder="Search all columns"
            aria-label="Search all columns"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button size="sm" variant={showFilters ? "secondary" : "outline"} className="h-8" onClick={() => setShowFilters((v) => !v)}>
          <Filter className="mr-1.5 h-3.5 w-3.5" />
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Button>
        {activeFilterCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => {
              setFilters({});
              setQuick("");
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          <Button size="sm" variant="outline" className="h-8" onClick={copySelection} title="Copy the selection (Ctrl+C)">
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={exportCsv} disabled={view.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        role="grid"
        aria-label={exportName}
        aria-rowcount={view.length + 1}
        aria-colcount={columns.length}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onPaste={onPaste}
        className="relative min-h-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div ref={scrollRef} className="h-full max-h-[calc(100vh-17rem)] min-h-[320px] overflow-auto">
          <div style={{ width: totalWidth, minWidth: "100%" }}>
            <div className="sticky top-0 z-20 bg-muted">
              <div role="row" className="flex border-b border-border" style={{ height: HEADER_HEIGHT }}>
                <div
                  className="sticky left-0 z-30 shrink-0 border-r border-border bg-muted"
                  style={{ width: GUTTER_WIDTH }}
                />
                {columns.map((column, col) => {
                  const sorted = sort?.columnId === column.id ? sort.dir : null;
                  return (
                    <div
                      key={column.id}
                      role="columnheader"
                      aria-colindex={col + 1}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                      className="relative shrink-0 border-r border-border"
                      style={{ width: colWidth(column) }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className={`flex h-full w-full items-center gap-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground ${column.align === "right" ? "justify-end" : ""}`}
                      >
                        <span className="truncate">{column.header}</span>
                        {sorted === "asc" && <ArrowUp className="h-3 w-3 shrink-0" />}
                        {sorted === "desc" && <ArrowDown className="h-3 w-3 shrink-0" />}
                      </button>
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        onMouseDown={(event) => startResize(event, column)}
                        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-primary/40"
                      />
                    </div>
                  );
                })}
              </div>
              {showFilters && (
                <div role="row" className="flex border-b border-border bg-background" style={{ height: FILTER_HEIGHT }}>
                  <div className="sticky left-0 z-30 shrink-0 border-r border-border bg-background" style={{ width: GUTTER_WIDTH }} />
                  {columns.map((column) => (
                    <div key={column.id} className="shrink-0 border-r border-border p-1" style={{ width: colWidth(column) }}>
                      <input
                        value={filters[column.id] ?? ""}
                        onChange={(event) => setFilters((current) => ({ ...current, [column.id]: event.target.value }))}
                        placeholder="filter"
                        aria-label={`Filter ${column.header}`}
                        title={'text · =exact · !not · >100 · 10..20 · "=" for blanks'}
                        className="h-6 w-full rounded border border-input bg-background px-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {view.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">{emptyMessage}</div>
            ) : (
              <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                {items.map((item) => {
                  const row = view[item.index];
                  const extra = rowClassName?.(row);
                  return (
                    <div
                      key={getRowId(row)}
                      role="row"
                      aria-rowindex={item.index + 2}
                      className={`absolute left-0 flex border-b border-border/60 ${extra ?? ""}`}
                      style={{ top: item.start, height: ROW_HEIGHT, width: "100%" }}
                    >
                      <div
                        className={`sticky left-0 z-10 flex shrink-0 items-center justify-center border-r border-border text-[11px] ${
                          item.index >= selection.top && item.index <= selection.bottom
                            ? "bg-primary/15 font-semibold text-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                        style={{ width: GUTTER_WIDTH }}
                      >
                        {item.index + 1}
                      </div>
                      {columns.map((column, col) => {
                        const isActive = active.row === item.index && active.col === col;
                        const selected = inSelection(item.index, col);
                        const isEditing = editing?.pos.row === item.index && editing.pos.col === col;
                        return (
                          <div
                            key={column.id}
                            role="gridcell"
                            aria-colindex={col + 1}
                            aria-selected={isActive}
                            data-cell={`${item.index}:${col}`}
                            onMouseDown={(event) => cellMouseDown(event, { row: item.index, col })}
                            onMouseEnter={() => cellMouseEnter({ row: item.index, col })}
                            onDoubleClick={() => startEditing({ row: item.index, col })}
                            className={`relative flex shrink-0 select-none items-center overflow-hidden border-r border-border/60 px-2 text-sm ${
                              column.align === "right" ? "justify-end tabular-nums" : ""
                            } ${selected && !isActive ? "bg-primary/10" : ""} ${isActive ? "z-[5] ring-2 ring-inset ring-primary" : ""}`}
                            style={{ width: colWidth(column) }}
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                value={editing.draft}
                                onFocus={(event) => event.currentTarget.setSelectionRange(editing.draft.length, editing.draft.length)}
                                onChange={(event) => setEditing({ pos: editing.pos, draft: event.target.value })}
                                onBlur={() => void commitEdit("none")}
                                onKeyDown={(event) => {
                                  event.stopPropagation();
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void commitEdit(event.shiftKey ? "up" : "down");
                                  } else if (event.key === "Tab") {
                                    event.preventDefault();
                                    void commitEdit("right");
                                  } else if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelEdit();
                                  }
                                }}
                                className="absolute inset-0 h-full w-full bg-background px-2 text-sm outline-none"
                                aria-label={`Edit ${column.header}`}
                              />
                            ) : (
                              <span className="truncate">{column.display ? column.display(row) : asText(column.value(row))}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          {view.length === rows.length ? `${rows.length.toLocaleString()} rows` : `${view.length.toLocaleString()} of ${rows.length.toLocaleString()} rows`}
        </span>
        {stats && stats.numericCount > 0 && (
          <>
            <span>Sum {stats.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span>Average {stats.average?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span>Count {stats.count.toLocaleString()}</span>
          </>
        )}
        {stats && stats.numericCount === 0 && <span>Count {stats.count.toLocaleString()}</span>}
        {footer?.(view)}
        <span className="ml-auto hidden md:inline">
          Arrows move · Enter/F2 edit · Ctrl+C/V copy/paste · Ctrl+D fill down · Ctrl+Z undo
        </span>
      </div>
    </div>
  );
}

export default SheetGrid;
