import * as React from "react";
import { cn } from "@/lib/utils";

type ChartFrameProps = {
  className?: string;
  children: (size: { width: number; height: number }) => React.ReactNode;
};

type AxisFormatter = (value: number) => string;

type LinePoint = {
  label: string;
  value: number;
};

type BarDatum = {
  label: string;
  value: number;
  title?: string;
};

type LineSeries = {
  key: string;
  color: string;
  data: LinePoint[];
  fill?: string;
  titlePrefix?: string;
};

const DEFAULT_PADDING = { top: 16, right: 16, bottom: 28, left: 44 };

function useMeasuredSize<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => {
      const next = { width: node.clientWidth, height: node.clientHeight };
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function buildAreaPath(points: Array<{ x: number; y: number }>, baseline: number) {
  if (points.length === 0) return "";
  const line = buildLinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

function getChartMetrics(values: number[], tickCount = 4) {
  const max = Math.max(0, ...values);
  const paddedMax = max === 0 ? 1 : max * 1.15;
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => (paddedMax / tickCount) * index);
  return { max: paddedMax, ticks };
}

export function ChartFrame({ className, children }: ChartFrameProps) {
  const { ref, size } = useMeasuredSize<HTMLDivElement>();

  return (
    <div ref={ref} className={className}>
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  );
}

export function SimpleLineAreaChart({
  className,
  series,
  yTickFormatter = (value) => String(Math.round(value)),
}: {
  className?: string;
  series: LineSeries[];
  yTickFormatter?: AxisFormatter;
}) {
  const labels = series[0]?.data.map((point) => point.label) || [];
  const values = series.flatMap((item) => item.data.map((point) => point.value));

  return (
    <ChartFrame className={className}>
      {({ width, height }) => {
        const padding = DEFAULT_PADDING;
        const innerWidth = Math.max(1, width - padding.left - padding.right);
        const innerHeight = Math.max(1, height - padding.top - padding.bottom);
        const { max, ticks } = getChartMetrics(values);
        const stepX = labels.length > 1 ? innerWidth / (labels.length - 1) : innerWidth / 2;
        const scaleY = (value: number) => padding.top + innerHeight - (value / max) * innerHeight;

        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            {ticks.map((tick) => {
              const y = scaleY(tick);
              return (
                <g key={tick}>
                  <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="hsl(var(--border))" strokeDasharray="3 3" opacity="0.6" />
                  <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="hsl(var(--muted-foreground))">
                    {yTickFormatter(tick)}
                  </text>
                </g>
              );
            })}
            {labels.map((label, index) => {
              const x = padding.left + (labels.length === 1 ? innerWidth / 2 : index * stepX);
              return (
                <text key={label + index} x={x} y={height - 8} textAnchor="middle" fontSize="11" fill="hsl(var(--muted-foreground))">
                  {label}
                </text>
              );
            })}
            {series.map((item) => {
              const points = item.data.map((point, index) => ({
                x: padding.left + (labels.length === 1 ? innerWidth / 2 : index * stepX),
                y: scaleY(point.value),
              }));
              const linePath = buildLinePath(points);
              const areaPath = item.fill ? buildAreaPath(points, padding.top + innerHeight) : "";

              return (
                <g key={item.key}>
                  {item.fill ? <path d={areaPath} fill={item.fill} opacity="1" /> : null}
                  <path d={linePath} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  {points.map((point, index) => (
                    <g key={`${item.key}-${index}`}>
                      <circle cx={point.x} cy={point.y} r="3" fill={item.color} />
                      <title>{`${item.titlePrefix || item.key}: ${item.data[index]?.value.toLocaleString()}`}</title>
                    </g>
                  ))}
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

export function SimpleBarChart({
  className,
  data,
  color,
  yTickFormatter = (value) => String(Math.round(value)),
}: {
  className?: string;
  data: BarDatum[];
  color: string;
  yTickFormatter?: AxisFormatter;
}) {
  const values = data.map((item) => item.value);

  return (
    <ChartFrame className={className}>
      {({ width, height }) => {
        const padding = DEFAULT_PADDING;
        const innerWidth = Math.max(1, width - padding.left - padding.right);
        const innerHeight = Math.max(1, height - padding.top - padding.bottom);
        const { max, ticks } = getChartMetrics(values);
        const gap = data.length > 0 ? Math.min(16, innerWidth * 0.08) : 0;
        const barWidth = data.length > 0 ? (innerWidth - gap * Math.max(0, data.length - 1)) / data.length : innerWidth;

        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            {ticks.map((tick) => {
              const y = padding.top + innerHeight - (tick / max) * innerHeight;
              return (
                <g key={tick}>
                  <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="hsl(var(--border))" strokeDasharray="3 3" opacity="0.6" />
                  <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="hsl(var(--muted-foreground))">
                    {yTickFormatter(tick)}
                  </text>
                </g>
              );
            })}
            {data.map((item, index) => {
              const barHeight = (item.value / max) * innerHeight;
              const x = padding.left + index * (barWidth + gap);
              const y = padding.top + innerHeight - barHeight;
              return (
                <g key={`${item.label}-${index}`}>
                  <rect x={x} y={y} width={Math.max(8, barWidth)} height={barHeight} rx="8" fill={color} />
                  <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="hsl(var(--muted-foreground))">
                    {item.label}
                  </text>
                  <title>{item.title || `${item.label}: ${item.value.toLocaleString()}`}</title>
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

export function SimpleLegend({
  items,
  className,
}: {
  items: Array<{ label: string; color: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex justify-center gap-4", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
