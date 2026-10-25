import { useMemo, useState } from "react";

// Click-to-sort for the registry tables. `getters` maps a column label -> row value; columns
// without a getter aren't sortable. Empty values always sort last.
export function useTableSort(rows, getters) {
  const [sort, setSort] = useState({ column: null, dir: "asc" });

  const sorted = useMemo(() => {
    const get = getters[sort.column];
    if (!get) return rows;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a) ?? "";
      const y = get(b) ?? "";
      if (x === "" || y === "") return x === y ? 0 : x === "" ? 1 : -1;
      return sign * String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
    });
  }, [rows, getters, sort]);

  const onSort = (column) =>
    setSort((s) => ({ column, dir: s.column === column && s.dir === "asc" ? "desc" : "asc" }));

  return { sorted, sort, onSort };
}

export const SortHead = ({ label, sortable, sort, onSort }) => (
  <th
    className={sortable ? "reg-th--sortable" : undefined}
    aria-sort={sort.column === label ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    onClick={sortable ? () => onSort(label) : undefined}
  >
    {label}
    {sortable && <span className="reg-sort-icon">{sort.column === label ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>}
  </th>
);
