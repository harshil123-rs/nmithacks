type SignalType = 'coupling' | 'churnRisk' | 'debt' | 'confidence';

const SIGNAL_META: Record<SignalType, { label: string; description: (v: any) => string; icon: string }> = {
  coupling:   {
    label: 'Coupling',
    description: (v) => v.normalized < 0.2
      ? 'Modular — dependencies well distributed'
      : v.normalized < 0.5
      ? 'Some centralisation — a few key files'
      : 'High coupling — god-files detected',
    icon: 'GitBranch',
  },
  churnRisk:  {
    label: 'Churn Risk',
    description: (v) => v.hotFileCount === 0
      ? 'No blast-radius files detected'
      : `${v.hotFileCount} high-centrality file${v.hotFileCount > 1 ? 's' : ''} changing frequently`,
    icon: 'Flame',
  },
  debt:       {
    label: 'Findings Debt',
    description: (v) => v.avgPerPR < 5
      ? 'Low debt — clean review history'
      : v.avgPerPR < 20
      ? `${v.avgPerPR.toFixed(1)} avg weighted findings per PR`
      : 'High debt — recurring unresolved findings',
    icon: 'AlertOctagon',
  },
  confidence: {
    label: 'AI Confidence',
    description: (v) => `${Math.round(v.rollingAvg)}/100 avg confidence across last 30 reviews`,
    icon: 'Brain',
  },
};

interface Props {
  signal: SignalType;
  value: any;
}

export function SignalCard({ signal, value }: Props) {
  const meta     = SIGNAL_META[signal];
  const pct      = signal === 'confidence'
    ? Math.round(value.normalized * 100)
    : Math.round(value.normalized * 100);
  const isGood   = signal === 'confidence' ? pct >= 70 : pct < 40;
  const isBad    = signal === 'confidence' ? pct < 40  : pct >= 70;
  const barColor = isGood ? '#16a34a' : isBad ? '#dc2626' : '#d97706';

  return (
    <div className="clay p-5" style={{ borderRadius: '20px' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">{meta.label}</span>
        <span className="text-lg font-bold font-mono" style={{ color: barColor }}>{pct}%</span>
      </div>
      <div className="w-full h-2 bg-gray-800/30 rounded-full mb-3">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{meta.description(value)}</p>
    </div>
  );
}
