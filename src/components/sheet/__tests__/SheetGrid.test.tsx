import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SheetGrid, { type SheetColumn } from "../SheetGrid";

interface Row {
  id: string;
  name: string;
  phone: string;
  amount: number;
}

const baseRows = (): Row[] => [
  { id: "1", name: "Charlie", phone: "333", amount: 300 },
  { id: "2", name: "Alice", phone: "111", amount: 100 },
  { id: "3", name: "Bob", phone: "222", amount: 200 },
];

const columns: SheetColumn<Row>[] = [
  { id: "name", header: "Name", width: 160, value: (r) => r.name, editable: true },
  { id: "phone", header: "Phone", width: 120, value: (r) => r.phone, editable: true },
  { id: "amount", header: "Amount", width: 100, align: "right", value: (r) => r.amount },
];

beforeAll(() => {
  // jsdom has no layout; give the virtualizer a viewport so it renders rows.
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
});

afterEach(cleanup);

/** Holds the rows in state, like the real screens do, so edits show up in the grid. */
function Harness(props: { onEdit: (row: Row, col: string, text: string) => void | Promise<void>; onError: (m: string) => void; editable?: boolean }) {
  const [rows, setRows] = useState(baseRows());
  return (
    <SheetGrid<Row>
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id}
      onEdit={
        props.editable === false
          ? undefined
          : async (row, col, text) => {
              await props.onEdit(row, col, text);
              setRows((current) => current.map((r) => (r.id === row.id ? { ...r, [col]: text } : r)));
            }
      }
      onError={props.onError}
      exportName="test-sheet"
    />
  );
}

const setup = async (options: { editable?: boolean } = {}) => {
  const onEdit = vi.fn();
  const onError = vi.fn();
  const utils = render(<Harness onEdit={onEdit} onError={onError} editable={options.editable} />);
  await screen.findAllByRole("gridcell");
  const grid = screen.getByRole("grid");
  return { ...utils, grid, onEdit, onError };
};

const cellText = () =>
  screen
    .getAllByRole("row")
    .filter((row) => within(row).queryAllByRole("gridcell").length > 0)
    .map((row) => within(row).getAllByRole("gridcell").map((cell) => cell.textContent));

const activeCell = () => document.querySelector('[role="gridcell"][aria-selected="true"]') as HTMLElement;

describe("SheetGrid", () => {
  it("renders the data and sorts by clicking a header", async () => {
    await setup();
    expect(cellText().map((r) => r[0])).toEqual(["Charlie", "Alice", "Bob"]);

    fireEvent.click(screen.getByRole("button", { name: /name/i }));
    expect(cellText().map((r) => r[0])).toEqual(["Alice", "Bob", "Charlie"]);

    fireEvent.click(screen.getByRole("button", { name: /name/i }));
    expect(cellText().map((r) => r[0])).toEqual(["Charlie", "Bob", "Alice"]);

    fireEvent.click(screen.getByRole("button", { name: /name/i }));
    expect(cellText().map((r) => r[0])).toEqual(["Charlie", "Alice", "Bob"]);
  });

  it("filters by column operators and by the quick search", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));

    fireEvent.change(screen.getByLabelText("Filter Amount"), { target: { value: ">=200" } });
    expect(cellText().map((r) => r[0])).toEqual(["Charlie", "Bob"]);
    expect(screen.getByText("2 of 3 rows")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Filter Amount"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Search all columns"), { target: { value: "ali" } });
    expect(cellText().map((r) => r[0])).toEqual(["Alice"]);
  });

  it("moves with the arrow keys and edits with Enter, committing to the next row", async () => {
    const { grid, onEdit } = await setup();
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(activeCell().textContent).toBe("Alice");

    fireEvent.keyDown(grid, { key: "Enter" });
    const input = screen.getByLabelText("Edit Name");
    fireEvent.change(input, { target: { value: "Alicia" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "2" }), "name", "Alicia"));
    expect(onEdit).toHaveBeenCalledTimes(1); // blur after Enter must not commit a second time
    await waitFor(() => expect(activeCell().textContent).toBe("Bob")); // moved down like Excel
  });

  it("starts editing when you just type, and Escape cancels", async () => {
    const { grid, onEdit } = await setup();
    fireEvent.keyDown(grid, { key: "x" });
    const input = screen.getByLabelText("Edit Name") as HTMLInputElement;
    expect(input.value).toBe("x");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByLabelText("Edit Name")).toBeNull();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("does not edit read-only columns", async () => {
    const { grid } = await setup();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(screen.queryByLabelText("Edit Amount")).toBeNull();
  });

  it("copies a shift-selected range as tab-separated text", async () => {
    const { grid } = await setup();
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(grid, { key: "ArrowRight", shiftKey: true });

    const setData = vi.fn();
    fireEvent.copy(grid, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", "Charlie\t333\nAlice\t111");
  });

  it("pastes a block starting at the active cell, skipping read-only columns", async () => {
    const { grid, onEdit } = await setup();
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.paste(grid, { clipboardData: { getData: () => "Zed\t999\t5000\nYan\t888\t6000\n" } });

    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(4));
    const calls = onEdit.mock.calls.map(([row, col, text]) => [row.id, col, text]);
    expect(calls).toEqual([
      ["2", "name", "Zed"],
      ["2", "phone", "999"],
      ["3", "name", "Yan"],
      ["3", "phone", "888"],
    ]);
  });

  it("fills a selected range with a single pasted value", async () => {
    const { grid, onEdit } = await setup();
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    fireEvent.paste(grid, { clipboardData: { getData: () => "Same" } });
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(3));
    expect(onEdit.mock.calls.map(([row, , text]) => [row.id, text])).toEqual([["1", "Same"], ["2", "Same"], ["3", "Same"]]);
  });

  it("fills down with Ctrl+D", async () => {
    const { grid, onEdit } = await setup();
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(grid, { key: "d", ctrlKey: true });
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(2));
    expect(onEdit.mock.calls.map(([row, , text]) => [row.id, text])).toEqual([["2", "Charlie"], ["3", "Charlie"]]);
  });

  it("clears editable cells with Delete and undoes with Ctrl+Z", async () => {
    const { grid, onEdit } = await setup();
    fireEvent.keyDown(grid, { key: "Delete" });
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }), "name", ""));

    onEdit.mockClear();
    fireEvent.keyDown(grid, { key: "z", ctrlKey: true });
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }), "name", "Charlie"));
  });

  it("reports rejected edits without recording undo", async () => {
    const { grid, onEdit, onError } = await setup();
    onEdit.mockRejectedValueOnce(new Error("Phone must be 10 digits"));
    fireEvent.keyDown(grid, { key: "x" });
    fireEvent.keyDown(screen.getByLabelText("Edit Name"), { key: "Enter" });

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Phone must be 10 digits"));
    onEdit.mockClear();
    fireEvent.keyDown(grid, { key: "z", ctrlKey: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("shows selection statistics like Excel's status bar", async () => {
    const { grid } = await setup();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    expect(screen.getByText(/Sum 600/)).toBeTruthy();
    expect(screen.getByText(/Average 200/)).toBeTruthy();
  });

  it("is read-only when no onEdit handler is given", async () => {
    const { grid } = await setup({ editable: false });
    fireEvent.keyDown(grid, { key: "x" });
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(screen.queryByLabelText("Edit Name")).toBeNull();
  });
});
