import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Minus, FileCode } from 'lucide-react';

interface FileDiff {
  filename: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface Props {
  commitSha: string;
  repoFullName: string;
  files: FileDiff[];
}

export function CommitDiffViewer({ commitSha, repoFullName, files }: Props) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const toggleFile = (filename: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(filename)) {
      newExpanded.delete(filename);
    } else {
      newExpanded.add(filename);
    }
    setExpandedFiles(newExpanded);
  };

  const parsePatch = (patch: string) => {
    const lines = patch.split('\n');
    const result: Array<{ type: 'add' | 'remove' | 'context' | 'header'; content: string }> = [];
    
    for (const line of lines) {
      if (line.startsWith('@@')) {
        result.push({ type: 'header', content: line });
      } else if (line.startsWith('+')) {
        result.push({ type: 'add', content: line.slice(1) });
      } else if (line.startsWith('-')) {
        result.push({ type: 'remove', content: line.slice(1) });
      } else {
        result.push({ type: 'context', content: line });
      }
    }
    
    return result;
  };

  if (files.length === 0) return null;

  return (
    <div className="clay p-5" style={{ borderRadius: '20px' }}>
      <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
        Code Changes
      </p>
      <div className="space-y-2">
        {files.map((file, i) => {
          const isExpanded = expandedFiles.has(file.filename);
          const parsedPatch = file.patch ? parsePatch(file.patch) : [];
          
          return (
            <div key={i} className="clay-pressed" style={{ borderRadius: '12px' }}>
              <button
                onClick={() => toggleFile(file.filename)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                )}
                <FileCode className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="text-xs font-mono flex-1 truncate">{file.filename}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {file.additions > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-chart-5">
                      <Plus className="w-2.5 h-2.5" />
                      {file.additions}
                    </span>
                  )}
                  {file.deletions > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-destructive">
                      <Minus className="w-2.5 h-2.5" />
                      {file.deletions}
                    </span>
                  )}
                </div>
              </button>
              
              {isExpanded && file.patch && (
                <div className="border-t border-white/[0.04] p-3 bg-black/20">
                  <div className="font-mono text-[10px] leading-relaxed space-y-0.5 max-h-96 overflow-y-auto">
                    {parsedPatch.map((line, j) => (
                      <div
                        key={j}
                        className={`px-2 py-0.5 ${
                          line.type === 'add'
                            ? 'bg-chart-5/10 text-chart-5'
                            : line.type === 'remove'
                            ? 'bg-destructive/10 text-destructive'
                            : line.type === 'header'
                            ? 'text-accent font-semibold'
                            : 'text-muted-foreground/50'
                        }`}
                      >
                        {line.type === 'add' && '+ '}
                        {line.type === 'remove' && '- '}
                        {line.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
