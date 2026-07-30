import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { isSignedIn } = useAuth();
    const initialEmail = searchParams.get("email") ?? "";
    const codeSent = searchParams.get("sent") === "1";
    const [email, setEmail] = useState(initialEmail);
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [resending, setResending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(
        codeSent ? "Reset code sent. Check your email." : null,
    );

    useEffect(() => {
        if (isSignedIn) {
            navigate("/");
        }
    }, [isSignedIn, navigate]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setSuccess(null);

        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedEmail) {
            setError("Please enter your email address.");
            return;
        }

        if (code.length !== 6) {
            setError("Please enter a valid 6-digit code.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setSubmitting(true);

        try {
            const { error } = await authClient.emailOtp.resetPassword({
                email: normalizedEmail,
                otp: code,
                password,
            });
            if (error) throw new Error(error.message || "Failed to reset password.");
            setSuccess("Password reset successfully. Redirecting to sign in...");
            setTimeout(() => {
                navigate("/sign-in", { replace: true });
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to reset password.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleResend = async () => {
        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedEmail) {
            setError("Please enter your email address before resending.");
            return;
        }

        setResending(true);
        setError(null);
        setSuccess(null);

        try {
            const { error } = await authClient.emailOtp.requestPasswordReset({
                email: normalizedEmail,
            });
            if (error) throw new Error(error.message || "Failed to resend reset code.");
            setSuccess("A new reset code was sent to your email.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to resend reset code.");
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
                        <h1 className="mb-1 text-2xl font-semibold text-white">Reset password</h1>
                        <p className="mb-6 text-white/65">
                            Enter the 6-digit code from your email and choose a new password.
                        </p>

                        <form className="space-y-4" onSubmit={handleSubmit}>
                            <div className="space-y-2">
                                <label
                                    htmlFor="email"
                                    className="text-sm font-medium text-white/80"
                                >
                                    Email
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    className="w-full rounded-lg bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                                    placeholder="you@example.com"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="code" className="text-sm font-medium text-white/80">
                                    Reset code
                                </label>
                                <input
                                    id="code"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
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

                            <div className="space-y-2">
                                <label
                                    htmlFor="password"
                                    className="text-sm font-medium text-white/80"
                                >
                                    New password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    className="w-full rounded-lg bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                                    placeholder="Create a new password"
                                    minLength={8}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label
                                    htmlFor="confirmPassword"
                                    className="text-sm font-medium text-white/80"
                                >
                                    Confirm password
                                </label>
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    className="w-full rounded-lg bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                                    placeholder="Re-enter your new password"
                                    minLength={8}
                                    required
                                />
                            </div>

                            {success ? (
                                <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-100">
                                    {success}
                                </div>
                            ) : null}

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
                                {submitting ? "Resetting password..." : "Reset password"}
                            </button>

                            <button
                                type="button"
                                onClick={handleResend}
                                className="w-full text-white/60 hover:text-white font-medium py-2 px-4 rounded-lg transition duration-200 disabled:opacity-60"
                                disabled={resending}
                            >
                                {resending ? "Sending..." : "Resend code"}
                            </button>
                        </form>

                        <p className="mt-6 text-center text-sm text-white/55">
                            Back to{" "}
                            <Link
                                to="/sign-in"
                                className="text-white hover:underline font-semibold"
                            >
                                sign in
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
