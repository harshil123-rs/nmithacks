interface Props {
  icon: any;
  label: string;
  value: string | number;
  color: string;
  trend?: number;
}

export function StatCard({ icon: Icon, label, value, color, trend }: Props) {
  return (
    <div className="clay p-4" style={{ borderRadius: '16px' }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        {trend !== undefined && trend !== 0 && (
          <span className={`text-[10px] font-medium mb-0.5 ${trend > 0 ? 'text-chart-5' : 'text-destructive'}`}>
            {trend > 0 ? '+' : ''}{trend}
          </span>
        )}
      </div>
    </div>
  );
}
