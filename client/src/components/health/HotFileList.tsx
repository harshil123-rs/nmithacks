import { Flame, FileCode } from 'lucide-react';

interface Props {
  files: string[];
}

export function HotFileList({ files }: Props) {
  if (files.length === 0) return null;
  return (
    <div className="clay-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Flame size={16} className="text-orange-400" />
        <h3 className="text-sm font-medium">Blast-radius files</h3>
        <span className="text-xs text-gray-400 ml-auto">High centrality + high churn</span>
      </div>
      <div className="flex flex-col gap-1">
        {files.map(f => (
          <div key={f} className="flex items-center gap-2 py-1.5 px-2 rounded bg-orange-500/5 border border-orange-500/20">
            <FileCode size={13} className="text-orange-400 shrink-0" />
            <span className="text-xs font-mono text-gray-300 truncate">{f}</span>
            <span className="text-xs text-orange-400 ml-auto shrink-0">monitor closely</span>
          </div>
        ))}
      </div>
    </div>
  );
}
