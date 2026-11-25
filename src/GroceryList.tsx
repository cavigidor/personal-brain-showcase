import { useRef, useState, type FormEvent } from "react";
import { Trash2, Check } from "lucide-react";
import type { GroceryItem } from "./types";
import type { BrainAction } from "./actions";
import { GROCERY_TITLE_LIMIT, GROCERY_STORE_LIMIT } from "./groceries";

type Props = {
  items: GroceryItem[];
  onChange: (actions: BrainAction[], message: string) => void;
};
const editable = (item: GroceryItem) =>
  JSON.stringify([item.title, item.store ?? ""]);
export default function GroceryList({ items, onChange }: Props) {
  const [title, setTitle] = useState(""),
    [error, setError] = useState("");
  const [editing, setEditing] = useState<{
    id: string;
    title: string;
    store: string;
    baseline: string;
  } | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const completed = items.filter((item) => item.done).length;
  const run = (actions: BrainAction[], message: string) => {
    try {
      onChange(actions, message);
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Changes could not be saved.");
      return false;
    }
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    if (
      run(
        [
          {
            entity: "groceries",
            operation: "create",
            value: {
              id: crypto.randomUUID(),
              title: title.trim(),
              done: false,
              createdAt: new Date().toISOString(),
            },
          },
        ],
        "Grocery added",
      )
    )
      setTitle("");
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!editing || !editing.title.trim()) return;
    const current = items.find((item) => item.id === editing.id);
    if (!current || editable(current) !== editing.baseline) {
      setError(
        "This item changed elsewhere. Copy your edits, then cancel and reopen it.",
      );
      return;
    }
    if (
      run(
        [
          {
            entity: "groceries",
            operation: "update",
            id: editing.id,
            patch: { title: editing.title.trim(), store: editing.store.trim() },
          },
        ],
        "Grocery saved",
      )
    ) {
      setEditing(null);
      addInput.current?.focus();
    }
  };
  const row = (item: GroceryItem) => (
    <li key={item.id} className="grocery-row">
      <label className="grocery-check">
        <input
          type="checkbox"
          aria-label={item.title}
          checked={item.done}
          onChange={(event) =>
            run(
              [
                {
                  entity: "groceries",
                  operation: "update",
                  id: item.id,
                  patch: { done: event.target.checked },
                },
              ],
              event.target.checked ? "Grocery completed" : "Grocery reopened",
            )
          }
        />
        <span aria-hidden="true">{item.done && <Check size={14} />}</span>
      </label>
      <button
        type="button"
        className={"grocery-title " + (item.done ? "struck" : "")}
        aria-label={`Edit ${item.title}`}
        aria-description={
          item.store ? `Preferred store: ${item.store}` : undefined
        }
        onClick={() => {
          setEditing({
            id: item.id,
            title: item.title,
            store: item.store ?? "",
            baseline: editable(item),
          });
          setError("");
        }}
      >
        {item.title}
        {item.store && <small>{item.store}</small>}
      </button>
      <button
        type="button"
        className="icon-action grocery-delete"
        aria-label={`Delete ${item.title}`}
        onClick={() => {
          if (
            run(
              [{ entity: "groceries", operation: "delete", id: item.id }],
              "Grocery deleted",
            )
          ) {
            if (editing?.id === item.id) setEditing(null);
            addInput.current?.focus();
          }
        }}
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
  return (
    <section className="panel grocery-list" aria-label="Grocery List">
      <details id="grocery-list">
        <summary>
          <span>Grocery List</span>
          <small>
            {completed} of {items.length} completed
          </small>
        </summary>
        <div className="grocery-content">
          <form className="grocery-add" onSubmit={add}>
            <div className="field grocery-add-field">
              <input
                ref={addInput}
                aria-label="New grocery item"
                placeholder="Add an item"
                value={title}
                maxLength={GROCERY_TITLE_LIMIT}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <button className="button secondary" disabled={!title.trim()}>
              Add item
            </button>
          </form>
          {error && (
            <p role="alert" className="form-notice">
              {error}
            </p>
          )}
          {editing && (
            <form className="grocery-edit" onSubmit={save}>
              <label className="field">
                Item name
                <input
                  autoFocus
                  required
                  value={editing.title}
                  maxLength={GROCERY_TITLE_LIMIT}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Store (optional)
                <input
                  value={editing.store}
                  maxLength={GROCERY_STORE_LIMIT}
                  onChange={(e) =>
                    setEditing({ ...editing, store: e.target.value })
                  }
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setEditing(null);
                    setError("");
                    addInput.current?.focus();
                  }}
                >
                  Cancel
                </button>
                <button className="button primary">Save item</button>
              </div>
            </form>
          )}
          {!items.length && (
            <p className="today-empty">Your grocery list is empty.</p>
          )}
          <ul aria-label="Grocery items">
            {[
              ...items.filter((item) => !item.done),
              ...items.filter((item) => item.done),
            ].map(row)}
          </ul>
        </div>
      </details>
    </section>
  );
}
