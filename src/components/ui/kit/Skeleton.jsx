import React from "react";

const WIDTHS = ["62%", "42%", "50%", "34%", "56%"];

/** One shimmering placeholder bar. */
export function Skel({ w = "100%", h = 12, style }) {
  return <span className="ui-skel" style={{ width: w, height: h, ...style }} aria-hidden="true" />;
}

/**
 * Placeholder rows for a plain <table>, in place of a spinner or dots while it loads.
 * Drop it inside <tbody> where the "loading" row used to be.
 */
export function SkeletonRows({ cols, rows = 5 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={`skel-${r}`} aria-hidden="true">
      {Array.from({ length: cols }, (_, c) => (
        <td key={c}>
          <Skel w={WIDTHS[(r + c) % WIDTHS.length]} h={14} />
        </td>
      ))}
    </tr>
  ));
}

/** Placeholder stack for card or list bodies. */
export function SkeletonList({ rows = 4, h = 44 }) {
  return (
    <div className="ui-skel-list" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skel key={i} h={h} w={i % 2 ? "92%" : "100%"} />
      ))}
    </div>
  );
}
