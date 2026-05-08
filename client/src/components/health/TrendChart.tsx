import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

interface Point {
  score: number;
  computedAt: string;
}

interface Props {
  data: Point[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="clay p-3" style={{ borderRadius: '10px', fontSize: '11px' }}>
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          Score: {p.value}
        </p>
      ))}
    </div>
  );
};

export function TrendChart({ data }: Props) {
  const formatted = data.map(d => ({
    score: d.score,
    date:  new Date(d.computedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  if (formatted.length === 0) return null;

  return (
    <div className="clay p-5" style={{ borderRadius: '20px' }}>
      <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
        90-day health trend
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={formatted}>
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} width={28} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={80} stroke="#16a34a" strokeDasharray="4 2" label={{ value: 'Good', fontSize: 10, fill: '#16a34a', position: 'right' }} />
          <ReferenceLine y={60} stroke="#d97706" strokeDasharray="4 2" label={{ value: 'Watch', fontSize: 10, fill: '#d97706', position: 'right' }} />
          <Line type="monotone" dataKey="score" stroke="#2563ab" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
