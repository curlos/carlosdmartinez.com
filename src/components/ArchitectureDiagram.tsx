import type { Architecture, DiagramEdge, DiagramNode } from "@/data/projects";

const BOX_W = 260;
const BOX_H = 84;
const DESKTOP_W = 1056;

// Stacked layout (768px and below, where the wide diagram's text gets too small to read): the hub first, every
// other box indented under the box it connects to. About the rendered width on a 375px phone, so 12px labels stay ~12px.
const MOBILE_W = 280;
const M_BOX_H = 64;
const M_INDENT = 28;
const M_GAP = 34;

const LINE = "stroke-underline-muted [stroke-width:1.5]";
const TITLE = "fill-text font-sans text-[16px] font-bold";
const SUB = "fill-muted font-mono text-[12px]";

function Marker({ id }: { id: string }) {
  return (
    <defs>
      <marker
        id={id}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0 0L10 5L0 10z" className="fill-underline-muted" />
      </marker>
    </defs>
  );
}

function Box({ node, x, y, w, h }: { node: DiagramNode; x: number; y: number; w: number; h: number }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx="8"
      className={`fill-surface [stroke-width:1.5] ${node.hub ? "stroke-accent" : "stroke-border"}`}
    />
  );
}

function Desktop({ architecture, id }: { architecture: Architecture; id: string }) {
  const { nodes, edges, height } = architecture;
  return (
    <svg viewBox={`0 0 ${DESKTOP_W} ${height}`} className="block h-auto w-full" aria-hidden="true">
      <Marker id={id} />
      {edges.map(({ line: [x1, y1, x2, y2], label, labelAt: [lx, ly], anchor, twoWay }, i) => (
        <g key={i}>
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className={LINE}
            markerStart={twoWay ? `url(#${id})` : undefined}
            markerEnd={`url(#${id})`}
          />
          <text x={lx} y={ly} textAnchor={anchor} className={SUB}>
            {label}
          </text>
        </g>
      ))}
      {nodes.map((node) => (
        <g key={node.id}>
          <Box node={node} x={node.x} y={node.y} w={BOX_W} h={BOX_H} />
          <text x={node.x + BOX_W / 2} y={node.y + 36} textAnchor="middle" className={TITLE}>
            {node.title}
          </text>
          <text x={node.x + BOX_W / 2} y={node.y + 60} textAnchor="middle" className={SUB}>
            {node.sub}
          </text>
        </g>
      ))}
    </svg>
  );
}

type Placed = { node: DiagramNode; depth: number; y: number; parent?: Placed; edge?: DiagramEdge };

// Walks the graph from the hub so every box sits under the box it connects to.
function stack({ nodes, edges }: Architecture): Placed[] {
  const hub = nodes.find((n) => n.hub) ?? nodes[0];
  const placed: Placed[] = [];
  const seen = new Set<string>();
  let y = 0;
  const visit = (node: DiagramNode, depth: number, parent?: Placed, edge?: DiagramEdge) => {
    seen.add(node.id);
    if (parent) y += M_GAP;
    const item = { node, depth, y, parent, edge };
    placed.push(item);
    y += M_BOX_H;
    for (const edge of edges) {
      const other = edge.from === node.id ? edge.to : edge.to === node.id ? edge.from : null;
      if (other && !seen.has(other)) {
        visit(nodes.find((n) => n.id === other)!, depth + 1, item, edge);
      }
    }
  };
  visit(hub, 0);
  return placed;
}

function Mobile({ architecture, id }: { architecture: Architecture; id: string }) {
  const placed = stack(architecture);
  const height = placed.at(-1)!.y + M_BOX_H;
  const xOf = (p: Placed) => p.depth * M_INDENT;

  return (
    <svg viewBox={`0 0 ${MOBILE_W} ${height}`} className="block h-auto w-full" aria-hidden="true">
      <Marker id={id} />
      {placed.map((p) => {
        const x = xOf(p);
        return (
          <g key={p.node.id}>
            {p.parent && p.edge && (
              <>
                {/* Elbow from the parent's left edge down into this box; the arrow points at whichever side answers. */}
                <path
                  d={`M${xOf(p.parent) + 14} ${p.parent.y + M_BOX_H + 2} V${p.y + M_BOX_H / 2} H${x - 2}`}
                  fill="none"
                  className={LINE}
                  markerStart={p.edge.twoWay || p.edge.to === p.parent.node.id ? `url(#${id})` : undefined}
                  markerEnd={p.edge.twoWay || p.edge.to === p.node.id ? `url(#${id})` : undefined}
                />
                <text x={x + 6} y={p.y - 11} className={SUB}>
                  {p.edge.label}
                </text>
              </>
            )}
            <Box node={p.node} x={x} y={p.y} w={MOBILE_W - x} h={M_BOX_H} />
            <text x={x + 14} y={p.y + 27} className={TITLE}>
              {p.node.title}
            </text>
            <text x={x + 14} y={p.y + 48} className={SUB}>
              {p.node.sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// `slug` keeps the marker ids unique: pages you leave stay in the document (hidden), and a url(#id)
// that resolves to another page's hidden marker draws no arrowhead.
export function ArchitectureDiagram({ architecture, slug }: { architecture: Architecture; slug: string }) {
  return (
    <figure className="mb-6 rounded-card border border-border bg-bg p-6 max-sm:p-4">
      <figcaption className="mb-4 font-mono text-[13px] text-muted">Architecture</figcaption>
      <div role="img" aria-label={architecture.label}>
        {/* max-[769px] is "under 769px" (Tailwind v4), so these two switch together at exactly 768/769. */}
        <div className="max-[769px]:hidden">
          <Desktop architecture={architecture} id={`${slug}-arrow-desktop`} />
        </div>
        <div className="mx-auto max-w-[340px] min-[769px]:hidden">
          <Mobile architecture={architecture} id={`${slug}-arrow-mobile`} />
        </div>
      </div>
    </figure>
  );
}
