import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@slidesage/ui";
import { authClient } from "@slidesage/ui/lib/auth-client";
import Header from "@/Header";

export default function ForgotPasswordPage() {
	const navigate = useNavigate();
	const { isSignedIn } = useAuth();
	const [email, setEmail] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (isSignedIn) {
			navigate("/");
		}
	}, [isSignedIn, navigate]);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		setSubmitting(true);

		const normalizedEmail = email.trim().toLowerCase();

		try {
			const { error } = await authClient.emailOtp.requestPasswordReset({
				email: normalizedEmail,
			});
			if (error) throw new Error(error.message || "Failed to send reset code.");
			navigate(`/reset-password?email=${encodeURIComponent(normalizedEmail)}&sent=1`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to send reset code.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="min-h-screen bg-transparent flex flex-col">
			<Header />
			<div className="flex-1 flex items-center justify-center px-4 py-8 md:px-8">
				<div className="max-w-md w-full">
					<div className="rounded-xl border border-white/10 bg-black/20 p-6">
						<h1 className="text-2xl font-semibold text-white mb-1">Forgot password</h1>
						<p className="text-white/65 mb-6">
							Enter your account email and we'll send a 6-digit reset code.
						</p>

						<form className="space-y-4" onSubmit={handleSubmit}>
							<div className="space-y-2">
								<label htmlFor="email" className="text-sm font-medium text-white/80">
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

							{error ? (
								<div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
									{error}
								</div>
							) : null}

							<button
								type="submit"
								className="w-full rounded-lg bg-white px-4 py-3 font-semibold text-black transition duration-200 disabled:opacity-60"
								disabled={submitting}
							>
								{submitting ? "Sending code..." : "Send reset code"}
							</button>
						</form>

						<p className="mt-6 text-center text-sm text-white/55">
							Remember your password?{" "}
							<Link to="/sign-in" className="text-white hover:underline font-semibold">
								Sign in
							</Link>
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
