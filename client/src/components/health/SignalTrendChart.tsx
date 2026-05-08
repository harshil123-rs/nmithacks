import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DataPoint {
  computedAt: string;
  coupling: number;
  churnRisk: number;
  debt: number;
  confidence: number;
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
          {p.name}: {Math.round(p.value * 100)}%
        </p>
      ))}
    </div>
  );
};

export function SignalTrendChart({ data }: Props) {
  const formatted = data.map(d => ({
    date: new Date(d.computedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    coupling: d.coupling,
    churnRisk: d.churnRisk,
    debt: d.debt,
    confidence: d.confidence,
  }));

  if (formatted.length === 0) return null;

  return (
    <div className="clay p-5" style={{ borderRadius: '20px' }}>
      <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
        Signal Trends (Normalized)
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={formatted} margin={{ left: -20, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="coupling"
            name="Coupling"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="churnRisk"
            name="Churn Risk"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="debt"
            name="Debt"
            stroke="#fbbf24"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="confidence"
            name="Confidence"
            stroke="#4ade80"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
          <span className="text-[10px] text-muted-foreground">Coupling</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
          <span className="text-[10px] text-muted-foreground">Churn Risk</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#fbbf24]" />
          <span className="text-[10px] text-muted-foreground">Debt</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#4ade80]" />
          <span className="text-[10px] text-muted-foreground">Confidence</span>
        </div>
      </div>
    </div>
  );
}
