import { Activity } from 'lucide-react';

interface Props {
  repoName?: string;
}

export function EmptyHealth({ repoName }: Props) {
  return (
    <div className="clay-card flex flex-col items-center justify-center py-16 gap-4">
      <Activity size={40} className="text-gray-400" />
      <h3 className="text-lg font-medium">No health data yet</h3>
      <p className="text-sm text-gray-400 text-center max-w-sm">
        {repoName
          ? `Health data for ${repoName} will appear after the next push to main.`
          : 'Health data will appear after the next push to main triggers the context indexer.'}
      </p>
      <p className="text-xs text-gray-500">
        The score is computed automatically on every push — no action required.
      </p>
    </div>
  );
}
