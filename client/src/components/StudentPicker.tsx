import { useEffect, useRef, useState } from "react";
import { Input } from "./ui";
import { api } from "../lib/api";
import { useAppSettings } from "../context/AppSettingsContext";
import { classTreeLabel } from "../lib/classTree";
import type { Student } from "../types";

interface StudentPickerProps {
  value: Student | null;
  onSelect: (student: Student) => void;
  /** Optional class name to narrow results to (Income's per-class fee flow). */
  classFilter?: string;
  placeholder?: string;
}

// Searchable, server-driven replacement for a plain <select> of every
// active student. The old dropdowns fetched students once with a fixed
// limit (100) and never queried again — fine for a small school, but a
// school with 500-700 active students could never reach anyone past the
// first page. This debounces keystrokes into api.getStudentsBasic({search})
// calls, which already run a real ILIKE search in SQL across name/roll/
// admission number (see server/src/routes/students.js), so every student
// stays reachable regardless of how many there are.
export function StudentPicker({ value, onSelect, classFilter, placeholder }: StudentPickerProps) {
  const { classTree } = useAppSettings();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    // This effect's whole job is to synchronize `results`/`loading` with
    // the debounced search query — there's no external system to
    // subscribe to here, just a delayed fetch, so the immediate
    // setLoading(true) (spinner text shows right away) is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.getStudentsBasic({
          status: "Active",
          search: query || undefined,
          class: classFilter || undefined,
          limit: 20,
        });
        if (alive) setResults(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (alive) setResults([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, classFilter, open]);

  useEffect(() => {
    const onOutsideClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, []);

  return (
    <div ref={boxRef} className="student-picker">
      <Input
        type="text"
        value={open ? query : value ? `${value.name} — রোল: ${value.roll}` : ""}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        placeholder={placeholder || "নাম বা রোল লিখে খুঁজুন..."}
      />
      {open && (
        <div className="soft-panel student-picker__panel">
          {loading ? (
            <div className="student-picker__hint">খোঁজা হচ্ছে...</div>
          ) : results.length ? (
            results.map((s) => (
              <button
                key={s.id}
                type="button"
                className="student-picker__result"
                onClick={() => {
                  onSelect(s);
                  setOpen(false);
                  setQuery("");
                }}
              >
                {s.name} — রোল: {s.roll}
                {s.class ? ` (${classTreeLabel(classTree, s.class)})` : ""}
              </button>
            ))
          ) : (
            <div className="student-picker__hint">কোনো ছাত্র পাওয়া যায়নি</div>
          )}
        </div>
      )}
    </div>
  );
}
