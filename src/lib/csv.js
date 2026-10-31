// Minimal RFC-4180 reader: quoted fields, "" escapes, CRLF/LF, leading BOM. Returns rows
// of strings with fully blank lines dropped; each kept row carries `.line`, its line in the file.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let newlines = 1;
  let startLine = 1;
  const src = text.replace(/^﻿/, "");
  const endRow = () => {
    row.push(field);
    field = "";
    if (row.some((c) => c.trim())) rows.push(Object.assign(row, { line: startLine }));
    row = [];
    startLine = newlines;
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "
") newlines++;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") endRow();
    else if (c !== "\r") field += c;
  }
  endRow();
  return rows;
}

export function downloadCsv(filename, rows) {
  const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
