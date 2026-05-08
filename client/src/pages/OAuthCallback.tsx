import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loader2, AlertCircle } from "lucide-react";

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const accessToken = searchParams.get("access_token");
    const refreshToken = searchParams.get("refresh_token");

    if (!accessToken || !refreshToken) {
      setError("Missing tokens from GitHub callback.");
      return;
    }

    // Store tokens
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);

    // Fetch user and redirect
    refreshUser()
      .then(() => {
        navigate("/dashboard/getting-started", { replace: true });
      })
      .catch(() => {
        setError("Failed to load your profile. Please try again.");
      });
  }, [searchParams, navigate, refreshUser]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      {/* Background layers */}
      <div className="absolute inset-0 hero-grid pointer-events-none" />
      <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/[0.06] rounded-full blur-[180px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="clay-xl p-2" style={{ borderRadius: "28px" }}>
          <div
            className="clay p-8 flex flex-col items-center gap-5"
            style={{ borderRadius: "22px" }}
          >
            <img
              src="/logo.png"
              alt="LGTM"
              className="w-14 h-14 rounded-full scale-125"
            />

            {error ? (
              <>
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-5 h-5" />
                  <p className="text-sm font-medium">Auth failed</p>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {error}
                </p>
                <a
                  href="/login"
                  className="clay-btn clay-btn-ghost px-6 py-2.5 text-sm"
                >
                  Back to login
                </a>
              </>
            ) : (
              <>
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">
                  Signing you in...
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
