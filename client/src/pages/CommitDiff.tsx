import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, ZoomIn, ZoomOut } from "lucide-react";
import axios from "../api/axios";

interface FileDiff {
  filename: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface CommitData {
  commitSha: string;
  files: string[];
  pushedAt: string;
  fileDiffs: FileDiff[];
}

/**
 * Displays a full-page diff viewer for a specific commit.
 * Fetches commit data from the repo health snapshot, parses unified diffs,
 * and renders a side-by-side file tree with syntax-highlighted diff output.
 * Supports zoom controls for font size adjustment.
 */
export default function CommitDiff() {
  const { repoId, commitSha } = useParams<{
    repoId: string;
    commitSha: string;
  }>();
  const navigate = useNavigate();
  const [commit, setCommit] = useState<CommitData | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fontSize, setFontSize] = useState(12);

  useEffect(() => {
    fetchCommitData();
  }, [repoId, commitSha]);

  const fetchCommitData = async () => {
    try {
      const res = await axios.get(`/health/${repoId}/commit/${commitSha}`);
      const commitData =
        res.data.commit ||
        res.data.recentPushes?.find(
          (p: CommitData) => p.commitSha === commitSha,
        );

      if (commitData) {
        setCommit(commitData);
        if (commitData.fileDiffs && commitData.fileDiffs.length > 0) {
          setSelectedFile(commitData.fileDiffs[0].filename);
        }
      }
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch commit data:", err);
      setLoading(false);
    }
  };

  const parsePatch = (patch: string) => {
    const lines = patch.split("\n");
    const result: Array<{
      type: "add" | "remove" | "context" | "header";
      content: string;
      oldLine?: number;
      newLine?: number;
    }> = [];

    let oldLine = 1;
    let newLine = 1;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
        const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
        if (match) {
          oldLine = parseInt(match[1]);
          newLine = parseInt(match[2]);
        }
        result.push({ type: "header", content: line });
      } else if (line.startsWith("+")) {
        result.push({
          type: "add",
          content: line.slice(1),
          newLine: newLine++,
        });
      } else if (line.startsWith("-")) {
        result.push({
          type: "remove",
          content: line.slice(1),
          oldLine: oldLine++,
        });
      } else if (line.startsWith(" ")) {
        result.push({
          type: "context",
          content: line.slice(1),
          oldLine: oldLine++,
          newLine: newLine++,
        });
      } else {
        result.push({
          type: "context",
          content: line,
          oldLine: oldLine++,
          newLine: newLine++,
        });
      }
    }

    return result;
  };

  const selectedFileDiff = commit?.fileDiffs.find(
    (f) => f.filename === selectedFile,
  );

  const handleZoomIn = () => {
    setFontSize((prev) => Math.min(prev + 2, 24));
  };

  const handleZoomOut = () => {
    setFontSize((prev) => Math.max(prev - 2, 8));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Loading commit details...</div>
      </div>
    );
  }

  if (!commit) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Commit not found</div>
      </div>
    );
  }

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 h-screen flex flex-col bg-[#0a0a0f] overflow-hidden">
      {/* Header */}
      <div
        className="clay p-4 flex items-center justify-between border-b border-gray-800 flex-shrink-0 m-4 mb-0"
        style={{ borderRadius: "20px" }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (repoId && /^[a-f0-9]{24}$/i.test(repoId)) {
                navigate(`/dashboard/repo-health?repo=${repoId}`);
              } else {
                navigate("/dashboard/repos");
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Repo Health
          </button>
          <div>
            <div className="text-sm text-gray-400">Commit</div>
            <div className="font-mono text-sm">{commitSha?.slice(0, 7)}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              className="clay-icon w-8 h-8 flex items-center justify-center hover:bg-gray-700/50 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-400 min-w-[3rem] text-center">
              {fontSize}px
            </span>
            <button
              onClick={handleZoomIn}
              className="clay-icon w-8 h-8 flex items-center justify-center hover:bg-gray-700/50 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
          <div className="text-sm text-gray-400">
            {new Date(commit.pushedAt).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-4 px-4 pb-4 pt-4 overflow-hidden">
        {/* File Tree Sidebar */}
        <div className="w-72 flex flex-col overflow-hidden">
          <div
            className="clay p-3 mb-3 flex-shrink-0"
            style={{ borderRadius: "16px" }}
          >
            <div className="text-xs font-semibold text-gray-300">
              Changed Files ({commit.fileDiffs.length})
            </div>
          </div>
          <div
            className="clay flex-1 overflow-y-auto"
            style={{ borderRadius: "20px" }}
          >
            <div className="p-2 space-y-1.5">
              {commit.fileDiffs.map((file) => (
                <button
                  key={file.filename}
                  onClick={() => setSelectedFile(file.filename)}
                  className={`w-full text-left transition-all ${
                    selectedFile === file.filename
                      ? "clay-pressed"
                      : "clay-sm hover:clay-pressed"
                  }`}
                  style={{ borderRadius: "12px" }}
                >
                  <div className="p-2.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-200 truncate font-mono">
                          {file.filename.split("/").pop()}
                        </div>
                        {file.filename.includes("/") && (
                          <div className="text-[10px] text-gray-500 truncate mt-0.5">
                            {file.filename.split("/").slice(0, -1).join("/")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="clay-pill px-1.5 py-0.5 text-[10px] text-green-400">
                        +{file.additions}
                      </span>
                      <span className="clay-pill px-1.5 py-0.5 text-[10px] text-red-400">
                        -{file.deletions}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Diff Viewer */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedFileDiff ? (
            <div
              className="clay h-full flex flex-col overflow-hidden"
              style={{ borderRadius: "20px" }}
            >
              {selectedFileDiff.patch ? (
                <div className="flex-1 overflow-auto p-4">
                  <div
                    className="clay-pressed font-mono"
                    style={{ borderRadius: "16px", fontSize: `${fontSize}px` }}
                  >
                    {parsePatch(selectedFileDiff.patch).map((line, idx) => (
                      <div
                        key={idx}
                        className={`flex ${
                          line.type === "add"
                            ? "bg-green-500/10"
                            : line.type === "remove"
                              ? "bg-red-500/10"
                              : line.type === "header"
                                ? "bg-blue-500/10"
                                : ""
                        }`}
                      >
                        {/* Line Numbers */}
                        <div className="flex flex-shrink-0">
                          <div className="w-12 text-right px-2 py-1 text-gray-600 select-none border-r border-gray-800">
                            {line.oldLine ?? ""}
                          </div>
                          <div className="w-12 text-right px-2 py-1 text-gray-600 select-none border-r border-gray-800">
                            {line.newLine ?? ""}
                          </div>
                        </div>

                        {/* Diff Indicator */}
                        <div className="w-8 px-2 py-1 text-center select-none flex-shrink-0">
                          {line.type === "add" && (
                            <span className="text-green-400">+</span>
                          )}
                          {line.type === "remove" && (
                            <span className="text-red-400">-</span>
                          )}
                        </div>

                        {/* Code Content */}
                        <div
                          className={`flex-1 px-2 py-1 whitespace-pre ${
                            line.type === "add"
                              ? "text-green-300"
                              : line.type === "remove"
                                ? "text-red-300"
                                : line.type === "header"
                                  ? "text-blue-300 font-semibold"
                                  : "text-gray-300"
                          }`}
                        >
                          {line.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-gray-400">
                    No diff data available for this file
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className="clay flex items-center justify-center h-full"
              style={{ borderRadius: "20px" }}
            >
              <div className="text-gray-400">Select a file to view changes</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
