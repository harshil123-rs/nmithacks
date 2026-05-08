import { AlertTriangle } from 'lucide-react';

interface Props {
  score: number;
  computedAt: string;
}

export function ScoreGauge({ score, computedAt }: Props) {
  const color   = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
  const label   = score >= 80 ? 'Healthy' : score >= 60 ? 'Needs attention' : 'Critical';
  const r = 54, cx = 70, cy = 70;
  const circ    = 2 * Math.PI * r;
  const dash    = (score / 100) * circ;
  const isStale = (Date.now() - new Date(computedAt).getTime()) > 7 * 86400000;

  return (
    <div className="clay-card flex flex-col items-center gap-3 p-6">
      {isStale && (
        <div className="flex items-center gap-1 text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full">
          <AlertTriangle size={12} />
          Last indexed over 7 days ago
        </div>
      )}
      <svg viewBox="0 0 140 140" width="140" height="140">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="12"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`} />
        <text x={cx} y={cy + 6}  textAnchor="middle" fontSize="28" fontWeight="700" fill={color}>{score}</text>
        <text x={cx} y={cy + 22} textAnchor="middle" fontSize="11" fill="#94a3b8">/ 100</text>
      </svg>
      <p className="font-medium" style={{ color }}>{label}</p>
      <p className="text-xs text-gray-400">
        Updated {new Date(computedAt).toLocaleString()}
      </p>
    </div>
  );
}
