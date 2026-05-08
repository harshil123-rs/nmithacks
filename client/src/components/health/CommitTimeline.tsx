import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  GitCommit,
  FileCode,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  ExternalLink,
} from "lucide-react";

interface Push {
  commitSha: string;
  files: string[];
  pushedAt: string;
  fileDiffs: Array<{
    filename: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
}

interface Props {
  pushes: Push[];
  repoId: string;
}

/**
 * Renders a timeline of recent push activity for a repository, showing commit SHAs,
 * changed files, addition/deletion counts, and expandable inline diff previews.
 * Each commit links to a full-page diff viewer via the CommitDiff route.
 */
export function CommitTimeline({ pushes, repoId }: Props) {
  const navigate = useNavigate();
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  if (pushes.length === 0) return null;

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const toggleCommit = (sha: string) => {
    setExpandedCommit(expandedCommit === sha ? null : sha);
    setExpandedFiles(new Set()); // Reset expanded files when toggling commit
  };

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
    const lines = patch.split("\n");
    const result: Array<{
      type: "add" | "remove" | "context" | "header";
      content: string;
    }> = [];

    for (const line of lines) {
      if (line.startsWith("@@")) {
        result.push({ type: "header", content: line });
      } else if (line.startsWith("+")) {
        result.push({ type: "add", content: line.slice(1) });
      } else if (line.startsWith("-")) {
        result.push({ type: "remove", content: line.slice(1) });
      } else {
        result.push({ type: "context", content: line });
      }
    }

    return result;
  };

  return (
    <div className="clay p-5" style={{ borderRadius: "20px" }}>
      <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mb-4">
        Recent Push Activity
      </p>
      <div className="space-y-3">
        {pushes.map((push, i) => {
          const isExpanded = expandedCommit === push.commitSha;
          const hasDiffs = push.fileDiffs && push.fileDiffs.length > 0;
          const totalAdditions =
            push.fileDiffs?.reduce((sum, f) => sum + (f.additions || 0), 0) ||
            0;
          const totalDeletions =
            push.fileDiffs?.reduce((sum, f) => sum + (f.deletions || 0), 0) ||
            0;

          return (
            <div
              key={i}
              className="clay-pressed"
              style={{ borderRadius: "12px" }}
            >
              <div className="flex items-start gap-3 p-3">
                <div className="clay-icon w-7 h-7 flex items-center justify-center bg-primary/10 flex-shrink-0">
                  <GitCommit className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-muted-foreground">
                      {push.commitSha.slice(0, 7)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50">
                      {formatTime(push.pushedAt)}
                    </span>
                    {hasDiffs && (
                      <div className="flex items-center gap-2 ml-auto">
                        {totalAdditions > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-chart-5">
                            <Plus className="w-2.5 h-2.5" />
                            {totalAdditions}
                          </span>
                        )}
                        {totalDeletions > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-destructive">
                            <Minus className="w-2.5 h-2.5" />
                            {totalDeletions}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {push.files.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {push.files.slice(0, 5).map((file, j) => (
                        <span
                          key={j}
                          className="clay-pill px-2 py-0.5 text-[9px] text-muted-foreground flex items-center gap-1"
                        >
                          <FileCode className="w-2.5 h-2.5" />
                          {file.split("/").pop()}
                        </span>
                      ))}
                      {push.files.length > 5 && (
                        <span className="text-[9px] text-muted-foreground/50 px-2 py-0.5">
                          +{push.files.length - 5} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/30 italic block mb-2">
                      No file changes tracked
                    </span>
                  )}
                  {hasDiffs && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleCommit(push.commitSha)}
                        className="flex items-center gap-1.5 text-[10px] text-primary hover:text-primary/80 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                        {isExpanded ? "Hide" : "View"} inline
                      </button>
                      <button
                        onClick={() =>
                          navigate(
                            `/dashboard/commit-diff/${repoId}/${push.commitSha}`,
                          )
                        }
                        className="flex items-center gap-1.5 text-[10px] text-accent hover:text-accent/80 transition-colors clay-pill px-2 py-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View Changes
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded diff view */}
              {isExpanded && hasDiffs && (
                <div className="border-t border-white/[0.04] p-3 bg-black/20">
                  <div className="space-y-2">
                    {push.fileDiffs.map((file, j) => {
                      const isFileExpanded = expandedFiles.has(file.filename);
                      const parsedPatch = file.patch
                        ? parsePatch(file.patch)
                        : [];

                      return (
                        <div
                          key={j}
                          className="clay-pressed"
                          style={{ borderRadius: "8px" }}
                        >
                          <button
                            onClick={() => toggleFile(file.filename)}
                            className="w-full flex items-center gap-2 p-2 text-left hover:bg-white/[0.02] transition-colors"
                          >
                            {isFileExpanded ? (
                              <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            )}
                            <FileCode className="w-3 h-3 text-primary flex-shrink-0" />
                            <span className="text-[10px] font-mono flex-1 truncate">
                              {file.filename}
                            </span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {file.additions > 0 && (
                                <span className="flex items-center gap-1 text-[9px] text-chart-5">
                                  <Plus className="w-2 h-2" />
                                  {file.additions}
                                </span>
                              )}
                              {file.deletions > 0 && (
                                <span className="flex items-center gap-1 text-[9px] text-destructive">
                                  <Minus className="w-2 h-2" />
                                  {file.deletions}
                                </span>
                              )}
                            </div>
                          </button>

                          {isFileExpanded && file.patch && (
                            <div className="border-t border-white/[0.04] p-2 bg-black/30">
                              <div className="font-mono text-[9px] leading-relaxed space-y-0.5 max-h-64 overflow-y-auto">
                                {parsedPatch.map((line, k) => (
                                  <div
                                    key={k}
                                    className={`px-2 py-0.5 ${
                                      line.type === "add"
                                        ? "bg-chart-5/10 text-chart-5"
                                        : line.type === "remove"
                                          ? "bg-destructive/10 text-destructive"
                                          : line.type === "header"
                                            ? "text-accent font-semibold"
                                            : "text-muted-foreground/50"
                                    }`}
                                  >
                                    {line.type === "add" && "+ "}
                                    {line.type === "remove" && "- "}
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
