import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DataPoint {
  computedAt: string;
  totalFiles: number;
  totalDefs: number;
}

interface Props {
  data: DataPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="clay p-3" style={{ borderRadius: '10px', fontSize: '11px' }}>
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export function CodebaseGrowthChart({ data }: Props) {
  const formatted = data.map(d => ({
    date: new Date(d.computedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    files: d.totalFiles,
    definitions: d.totalDefs,
  }));

  if (formatted.length === 0) return null;

  return (
    <div className="clay p-5" style={{ borderRadius: '20px' }}>
      <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
        Codebase Growth
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={formatted} margin={{ left: -20, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="definitions"
            name="Definitions"
            stroke="#818cf8"
            fill="#818cf8"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="files"
            name="Files"
            stroke="#2dd4bf"
            fill="#2dd4bf"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#818cf8]" />
          <span className="text-[10px] text-muted-foreground">Definitions</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#2dd4bf]" />
          <span className="text-[10px] text-muted-foreground">Files</span>
        </div>
      </div>
    </div>
  );
}
