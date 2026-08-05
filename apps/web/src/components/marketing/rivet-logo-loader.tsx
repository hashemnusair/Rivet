/**
 * The RIVET mark loading itself: the frame holds still while the eight plates
 * fall through the stack in a wave, like weights being racked. Same geometry as
 * the loop machine, so the loader and the section on the landing page are
 * unmistakably the same object.
 */
const PLATES = [
  { x: 73.5, w: 34, y: 67 },
  { x: 73.5, w: 34, y: 80 },
  { x: 73.5, w: 34, y: 93 },
  { x: 73.5, w: 34, y: 106 },
  { x: 73.5, w: 53.5, y: 119 },
  { x: 73.5, w: 53.5, y: 132 },
  { x: 73.5, w: 53.5, y: 145 },
  { x: 73.5, w: 53.5, y: 158 },
];

export function RivetLogoLoader({ className }: { className?: string }) {
  return (
    <svg viewBox="44 20 102 152" className={className} role="img" aria-label="Loading">
      {/* frame */}
      <rect x={50} y={26} width={8} height={142} rx={2.5} fill="currentColor" />
      <rect x={50} y={26} width={54} height={8} rx={2.5} fill="currentColor" />
      <rect x={96} y={26} width={8} height={30.5} rx={2.5} fill="currentColor" />

      {PLATES.map((plate, index) => (
        <rect
          key={index}
          x={plate.x}
          y={plate.y}
          width={plate.w}
          height={10}
          rx={2}
          fill="currentColor"
          className="animate-plate-drop motion-reduce:animate-none"
          style={{ animationDelay: `${index * 90}ms` }}
        />
      ))}

      {/* selector pin, resting in its home plate */}
      <g fill="var(--color-signal)">
        <rect x={124.5} y={121.8} width={9.5} height={4.4} rx={2.2} />
      </g>
      <circle cx={137} cy={124} r={4} fill="none" stroke="var(--color-signal)" strokeWidth={3.4} />
    </svg>
  );
}
