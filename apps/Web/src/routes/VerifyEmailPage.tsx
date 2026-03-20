import { type SubmitEvent, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "";

function sanitizeRedirectPath(value: string | null) {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email");
  const redirectTo = sanitizeRedirectPath(searchParams.get("redirect_url"));
  const location = useLocation();
  const password =
    typeof (location.state as { password?: unknown } | null)?.password ===
    "string"
      ? (location.state as { password?: string }).password
      : undefined;
  const navigate = useNavigate();
  const { isSignedIn, user } = useAuth();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (isSignedIn && user?.emailVerified) {
      navigate(redirectTo);
    }
  }, [isSignedIn, navigate, redirectTo, user?.emailVerified]);

  // Redirect if no email is provided
  useEffect(() => {
    if (!email) navigate("/sign-up");
  }, [email, navigate]);

  const handleVerify = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!code || code.length !== 6) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/verify-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          code,
          password,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || "Verification failed");
      }

      setSuccess(true);
      // Redirect after a short delay to show success message
      setTimeout(() => {
        navigate(redirectTo, { replace: true });
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;

    setResending(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/auth/resend-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || "Failed to resend code");
      }

      setError(null);
      alert("Verification code sent to your email");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4 py-8 md:px-8">
        <div className="max-w-md w-full">
          <div className="rounded-xl border border-white/10 bg-black/20 p-6">
            <h1 className="mb-1 text-2xl font-semibold text-white">
              Verify email
            </h1>
            <p className="mb-6 text-white/65">
              We sent a 6-digit code to{" "}
              <span className="text-white font-semibold">{email}</span>
            </p>

            {success ? (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-100 mb-6">
                ✓ Email verified successfully! Redirecting to sign in...
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleVerify}>
                <div className="space-y-2">
                  <label
                    htmlFor="code"
                    className="text-sm font-medium text-white/80"
                  >
                    Verification Code
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(event) => {
                      const value = event.target.value.replace(/\D/g, "");
                      setCode(value);
                    }}
                    placeholder="000000"
                    className="w-full rounded-lg bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-center text-2xl tracking-widest font-mono"
                    required
                  />
                  <p className="text-xs text-white/50 text-center mt-2">
                    Code expires in 15 minutes
                  </p>
                </div>

                {error ? (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="w-full rounded-lg bg-white px-4 py-3 font-semibold text-black transition duration-200 disabled:opacity-60"
                  disabled={submitting || code.length !== 6}
                >
                  {submitting ? "Verifying..." : "Verify Email"}
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  className="w-full text-white/60 hover:text-white font-medium py-2 px-4 rounded-lg transition duration-200 disabled:opacity-60"
                  disabled={resending}
                >
                  {resending ? "Sending..." : "Resend Code"}
                </button>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-white/55">
              Wrong email?{" "}
              <a
                href="/sign-up"
                className="text-white hover:underline font-semibold"
              >
                Sign up again
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
