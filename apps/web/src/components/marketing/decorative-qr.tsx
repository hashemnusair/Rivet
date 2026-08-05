/**
 * Decorative stand-in for a member's entry code on the marketing page. The real
 * one is generated from a signed token inside the member app — this is only a
 * deterministic pattern so server and client render identically.
 *
 * Draws in `currentColor`; finder-ring holes use night-ink, so place it on a
 * night-ink surface.
 */
export function DecorativeQr() {
  const size = 25;
  const finder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8);

  const cells: React.ReactNode[] = [];
  let seed = 20260731;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if (finder(x, y) || (seed >> 15) % 100 >= 47) continue;
      cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full" fill="currentColor" aria-hidden>
      {cells}
      {[
        [0, 0],
        [size - 7, 0],
        [0, size - 7],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="7" height="7" />
          <rect x={x! + 1} y={y! + 1} width="5" height="5" fill="var(--color-night-ink)" />
          <rect x={x! + 2} y={y! + 2} width="3" height="3" />
        </g>
      ))}
    </svg>
  );
}
