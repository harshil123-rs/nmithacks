import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../hooks/useSocket";
import {
  GitPullRequest,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  Menu,
  X,
  FolderGit2,
  PanelLeftClose,
  PanelLeftOpen,
  DollarSign,
  Cpu,
  Bell,
  CheckCircle2,
  Shield,
  Sparkles,
  History,
  BookOpen,
  User as UserIcon,
  Rocket,
  BugPlay,
  Lightbulb,
  BarChart2,
  Workflow,
} from "lucide-react";
import api from "../../api/axios";

const NAV_ITEMS = [
  {
    label: "Getting Started",
    icon: Rocket,
    path: "/dashboard/getting-started",
  },
  { label: "Pull Requests", icon: GitPullRequest, path: "/dashboard" },
  { label: "My PRs", icon: UserIcon, path: "/dashboard/my-prs" },
  { label: "Reviews", icon: History, path: "/dashboard/reviews" },
  { label: "Repos", icon: FolderGit2, path: "/dashboard/repos" },
  { label: "Analytics", icon: BarChart3, path: "/dashboard/analytics" },
  {
    label: "Repo Health",
    icon: BarChart2,
    path: "/dashboard/repo-health",
    beta: true,
  },
  {
    label: "Security",
    icon: Shield,
    path: "/dashboard/security",
    beta: true,
  },
  { label: "Settings", icon: Settings, path: "/dashboard/settings" },
  { label: "Plans", icon: DollarSign, path: "/dashboard/pricing" },
  { label: "Compare Models", icon: Cpu, path: "/dashboard/models" },
  { label: "n8n AI Review", icon: Workflow, path: "/dashboard/n8n-review", beta: true },
];

const PINNED_ITEMS = [{ label: "Docs", icon: BookOpen, path: "/docs" }];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { on } = useSocket(user?._id);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (dropdownOpen || notifOpen)
      document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen, notifOpen]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time notification updates
  useEffect(() => {
    const cleanup = on("notification:new", () => {
      fetchNotifications();
    });
    return cleanup;
  }, [on, fetchNotifications]);

  const handleMarkRead = async (notifId: string) => {
    try {
      await api.patch(`/notifications/${notifId}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notifId ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      /* ignore */
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.patch("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  };

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen z-50 lg:z-auto flex flex-col transition-all duration-200 ${
          collapsed ? "w-[72px]" : "w-64"
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div
          className="flex-1 clay-lg m-2 p-3 flex flex-col overflow-hidden"
          style={{ borderRadius: "20px" }}
        >
          {/* Brand */}
          <div
            className={`flex items-center mb-6 ${collapsed ? "justify-center" : "justify-between"}`}
          >
            {collapsed ? (
              <img
                src="/logo.png"
                alt="LGTM"
                className="w-9 h-9 rounded-full scale-125 cursor-pointer"
                onClick={() => navigate("/")}
              />
            ) : (
              <>
                <div
                  className="flex items-center gap-2.5 cursor-pointer"
                  onClick={() => navigate("/")}
                >
                  <img
                    src="/logo.png"
                    alt="LGTM"
                    className="w-9 h-9 rounded-full scale-125"
                  />
                  <div>
                    <span className="text-base font-bold tracking-tight">
                      LGTM
                    </span>
                    <p className="text-[9px] text-muted-foreground leading-none">
                      Looks Good To Meow
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Scrollable nav items */}
          <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden min-h-0">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 rounded-xl text-sm transition-all ${
                    collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
                  } ${
                    isActive
                      ? "clay-pressed text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.02]"
                  }`}
                >
                  <item.icon
                    className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-primary" : ""}`}
                  />
                  {!collapsed && item.label}
                  {!collapsed && item.beta && (
                    <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      Beta
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Pinned bottom section */}
          <div className="flex-shrink-0 pt-2 border-t border-white/[0.04]">
            {/* Pinned nav items (Docs) */}
            {PINNED_ITEMS.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-2.5 rounded-xl text-xs transition-all ${
                    collapsed ? "justify-center px-0 py-1.5" : "px-3 py-1.5"
                  } ${
                    isActive
                      ? "clay-pressed text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.02]"
                  }`}
                >
                  <item.icon
                    className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? "text-primary" : ""}`}
                  />
                  {!collapsed && item.label}
                </button>
              );
            })}

            {/* Report Bug & Suggest Feature */}
            <a
              href="https://github.com/tarinagarwal/lgtm-feedback/issues/new?template=bug_report.md"
              target="_blank"
              rel="noopener noreferrer"
              title={collapsed ? "Report a Bug" : undefined}
              className={`w-full flex items-center gap-2.5 rounded-xl text-xs py-1.5 text-muted-foreground hover:text-foreground hover:bg-white/[0.02] transition-all ${
                collapsed ? "justify-center px-0" : "px-3"
              }`}
            >
              <BugPlay className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
              {!collapsed && <span className="text-red-400">Report a Bug</span>}
            </a>
            <a
              href="https://github.com/tarinagarwal/lgtm-feedback/issues/new?template=feature_request.md"
              target="_blank"
              rel="noopener noreferrer"
              title={collapsed ? "Suggest a Feature" : undefined}
              className={`w-full flex items-center gap-2.5 rounded-xl text-xs py-1.5 text-muted-foreground hover:text-foreground hover:bg-white/[0.02] transition-all ${
                collapsed ? "justify-center px-0" : "px-3"
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 text-lime-400" />
              {!collapsed && (
                <span className="text-lime-400">Suggest a Feature</span>
              )}
            </a>

            {/* Notification bell */}
            <div className="relative py-1" ref={notifRef}>
              <button
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  setDropdownOpen(false);
                }}
                title={collapsed ? "Notifications" : undefined}
                className={`w-full flex items-center gap-2.5 rounded-xl text-xs py-1.5 text-muted-foreground hover:text-foreground hover:bg-white/[0.02] transition-all ${
                  collapsed ? "justify-center px-0" : "px-3"
                }`}
              >
                <div className="relative flex-shrink-0">
                  <Bell className="w-3.5 h-3.5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center">
                      <span className="text-[8px] font-bold text-background">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    </span>
                  )}
                </div>
                {!collapsed && (
                  <>
                    Notifications
                    {unreadCount > 0 && (
                      <span className="ml-auto text-[10px] text-primary font-bold">
                        {unreadCount}
                      </span>
                    )}
                  </>
                )}
              </button>

              {notifOpen && (
                <div
                  className={`absolute bottom-full mb-2 clay p-2 z-50 max-h-80 overflow-y-auto ${
                    collapsed ? "left-full ml-2 w-72" : "left-0 right-0"
                  }`}
                  style={{
                    borderRadius: "14px",
                    minWidth: collapsed ? "288px" : undefined,
                  }}
                >
                  <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                    <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">
                      Notifications
                    </p>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[10px] text-primary hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No notifications
                    </p>
                  ) : (
                    notifications.slice(0, 15).map((n) => (
                      <button
                        key={n._id}
                        onClick={() => {
                          if (!n.isRead) handleMarkRead(n._id);
                          setNotifOpen(false);
                          if (n.prId) {
                            navigate(`/dashboard/pr/${n.prId}`);
                          } else if (n.reviewId) {
                            navigate(`/dashboard`);
                          }
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors flex items-start gap-2 ${
                          n.isRead ? "opacity-50" : "hover:bg-white/[0.03]"
                        }`}
                      >
                        {n.type === "critical_security" ? (
                          <Shield className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
                        ) : n.type === "ai_approved" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-chart-5 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-foreground leading-snug">
                            {n.message}
                          </p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">
                            {new Date(n.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {!n.isRead && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Collapse toggle (desktop only) */}
            <div className="hidden lg:block py-1">
              <button
                onClick={() => {
                  setCollapsed(!collapsed);
                  setDropdownOpen(false);
                }}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className={`w-full flex items-center gap-2.5 rounded-xl text-xs py-1.5 text-muted-foreground hover:text-foreground hover:bg-white/[0.02] transition-all ${
                  collapsed ? "justify-center px-0" : "px-3"
                }`}
              >
                {collapsed ? (
                  <PanelLeftOpen className="w-3.5 h-3.5 flex-shrink-0" />
                ) : (
                  <>
                    <PanelLeftClose className="w-3.5 h-3.5 flex-shrink-0" />
                    Collapse
                  </>
                )}
              </button>
            </div>

            {/* User section at bottom */}
            <div className="pt-2">
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  title={collapsed ? user?.username : undefined}
                  className={`w-full flex items-center rounded-xl hover:bg-white/[0.02] transition-colors ${
                    collapsed
                      ? "justify-center py-1.5 px-0"
                      : "gap-2 px-2 py-1.5"
                  }`}
                >
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.username}
                      className="w-7 h-7 rounded-full border border-white/10 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-primary">
                        {user?.username?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {!collapsed && (
                    <>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-xs font-medium truncate">
                          {user?.username}
                        </p>
                        <p className="text-[9px] text-muted-foreground truncate">
                          {user?.email || "No email"}
                        </p>
                      </div>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 ${
                          dropdownOpen ? "rotate-180" : ""
                        }`}
                      />
                    </>
                  )}
                </button>

                {dropdownOpen && (
                  <div
                    className={`absolute bottom-full mb-2 clay p-1.5 z-50 ${
                      collapsed ? "left-full ml-2 w-44" : "left-0 right-0"
                    }`}
                    style={{ borderRadius: "14px" }}
                  >
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        navigate("/dashboard/settings");
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.03] rounded-lg transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Settings
                    </button>
                    <button
                      onClick={async () => {
                        setDropdownOpen(false);
                        await logout();
                        navigate("/");
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-destructive/80 hover:text-destructive hover:bg-destructive/[0.05] rounded-lg transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div
          className="lg:hidden sticky top-0 z-30 clay-sm mx-2 mt-2 px-3 py-2.5 flex items-center justify-between"
          style={{ borderRadius: "16px" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 text-muted-foreground hover:text-foreground"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="LGTM"
              className="w-4 h-4 rounded-full scale-125"
            />
            <span className="text-sm font-bold">LGTM</span>
          </div>
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="w-7 h-7 rounded-full border border-white/10"
            />
          ) : (
            <div className="w-7 h-7" />
          )}
        </div>

        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
