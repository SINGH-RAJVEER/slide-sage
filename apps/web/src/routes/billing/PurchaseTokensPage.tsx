import type {
	ApiErrorResponse,
	BillingBalanceResponse,
	BillingCheckoutRequest,
	BillingCheckoutResponse,
	BillingPackName,
	BillingVerifyRequest,
	BillingVerifyResponse,
} from "@slidesage/types";
import { Button } from "@slidesage/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@slidesage/ui/components/card";
import { Input } from "@slidesage/ui/components/input";
import { API_URL } from "@slidesage/ui/lib/api";
import { publishPointsBalance } from "@slidesage/ui/lib/points";
import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/app/Header";

declare global {
	interface Window {
		Razorpay: new (options: RazorpayOptions) => { open(): void };
	}
}

interface RazorpayOptions {
	key: string;
	amount: number;
	currency: string;
	order_id: string;
	name: string;
	description: string;
	theme?: { color?: string };
	handler: (response: {
		razorpay_payment_id: string;
		razorpay_order_id: string;
		razorpay_signature: string;
	}) => void;
	modal?: { ondismiss?: () => void };
}

function loadRazorpayScript(): Promise<void> {
	return new Promise((resolve, reject) => {
		if (window.Razorpay) {
			resolve();
			return;
		}
		const script = document.createElement("script");
		script.src = "https://checkout.razorpay.com/v1/checkout.js";
		script.onload = () => resolve();
		script.onerror = () => reject(new Error("Failed to load Razorpay"));
		document.body.appendChild(script);
	});
}

export default function PurchaseTokensPage() {
	const [customAmount, setCustomAmount] = useState<string>("");
	const [selectedOption, setSelectedOption] = useState<BillingPackName | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [balance, setBalance] = useState<BillingBalanceResponse | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const processingRef = useRef(false);

	const status = useMemo(() => {
		const params = new URLSearchParams(window.location.search);
		return params.get("status");
	}, []);

	const fetchBalance = useCallback(async () => {
		try {
			const res = await fetch(`${API_URL}/billing/balance`, {
				method: "GET",
				credentials: "include",
			});
			if (!res.ok) return;
			const data = (await res.json()) as BillingBalanceResponse;
			setBalance(data);
		} catch {
			// ignore
		}
	}, []);

	useEffect(() => {
		void fetchBalance();

		if (status === "success" || status === "cancel") {
			const url = new URL(window.location.href);
			url.searchParams.delete("status");
			window.history.replaceState({}, "", url.toString());
		}
	}, [fetchBalance, status]);

	const handlePurchase = async (amount: number, option: BillingPackName) => {
		if (processingRef.current) return;
		processingRef.current = true;
		setIsProcessing(true);
		setSelectedOption(option);
		setErrorMessage(null);
		setSuccessMessage(null);

		try {
			await loadRazorpayScript();

			const res = await fetch(`${API_URL}/billing/checkout`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					pack: option,
					quantity: option === "custom" ? amount : undefined,
				} satisfies BillingCheckoutRequest),
			});

			const data = (await res.json().catch(() => ({}))) as
				| BillingCheckoutResponse
				| ApiErrorResponse;
			if (!res.ok) {
				throw new Error("error" in data ? data.error.message : "Failed to start checkout");
			}

			const order = data as BillingCheckoutResponse;

			await new Promise<void>((resolve, reject) => {
				const rzp = new window.Razorpay({
					key: order.keyId,
					amount: order.amount,
					currency: order.currency,
					order_id: order.orderId,
					name: "Slide Sage",
					description: `${order.tokens} slide points`,
					theme: { color: "#3B82F6" },
					handler: async (response) => {
						try {
							const verifyRes = await fetch(`${API_URL}/billing/verify`, {
								method: "POST",
								credentials: "include",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
									razorpay_order_id: response.razorpay_order_id,
									razorpay_payment_id: response.razorpay_payment_id,
									razorpay_signature: response.razorpay_signature,
								} satisfies BillingVerifyRequest),
							});

							const verifyData = (await verifyRes.json()) as BillingVerifyResponse;

							if (!verifyRes.ok || !verifyData.success) {
								reject(new Error("Payment verification failed"));
								return;
							}

							setBalance({
								slide_tokens: verifyData.new_balance,
							});
							publishPointsBalance(verifyData.new_balance);
							setSuccessMessage(`${verifyData.tokens_awarded} points added to your account!`);
							resolve();
						} catch (err) {
							reject(err);
						}
					},
					modal: {
						ondismiss: () => {
							reject(new Error("cancelled"));
						},
					},
				});

				rzp.open();
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Checkout failed";
			if (msg !== "cancelled") {
				setErrorMessage(msg);
			}
		} finally {
			processingRef.current = false;
			setIsProcessing(false);
			setSelectedOption(null);
		}
	};

	const handleCustomPurchase = () => {
		const amount = parseInt(customAmount, 10);
		if (amount >= 25 && amount <= 2500) {
			handlePurchase(amount, "custom");
		}
	};

	const isCustomAmountValid = () => {
		const amount = parseInt(customAmount, 10);
		return !Number.isNaN(amount) && amount >= 25 && amount <= 2500;
	};

	const calculateCustomPrice = (amountStr: string) => {
		const amount = parseInt(amountStr, 10);
		if (Number.isNaN(amount)) return 0;
		let price = amount * 2;
		if (amount >= 625) {
			price = price * 0.8;
		} else if (amount >= 250) {
			price = price * 0.9;
		}
		return price;
	};

	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-transparent">
			<Header />

			{/* Main Content */}
			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-8 md:py-8">
				<div className="w-full max-w-[1800px] mx-auto relative">
					<div className="mb-6 flex items-center justify-start gap-4">
						<h1 className="text-2xl font-semibold text-white md:text-3xl">Purchase Points</h1>
					</div>

					<div className="mb-10 flex flex-col items-center justify-center space-y-2 rounded-xl border border-white/10 bg-black/20 px-4 py-6">
						<h2 className="text-white/40 text-sm uppercase tracking-widest font-medium">
							Current Balance
						</h2>
						<div className="flex items-baseline gap-2">
							<span className="text-4xl font-light text-white">
								{balance?.slide_tokens?.toFixed(1) ?? "0.0"}
							</span>
							<span className="text-lg text-white/40 font-light">points</span>
						</div>
						{successMessage && (
							<div className="text-xs text-green-400/80 font-medium tracking-wide">
								{successMessage}
							</div>
						)}
						{errorMessage && (
							<div className="text-xs text-red-400/80 font-medium tracking-wide">
								{errorMessage}
							</div>
						)}
					</div>

					{/* Purchase Options */}
					<div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
						{/* Option 1: 25 Tokens */}
						<Card className="flex flex-col border border-white/10 bg-black/20 transition-colors hover:bg-white/5">
							<CardHeader>
								<CardTitle className="text-white text-2xl">Starter Pack</CardTitle>
								<CardDescription className="text-white/60">Perfect for trying out</CardDescription>
							</CardHeader>
							<CardContent className="flex-1 flex flex-col">
								<div className="flex-1 space-y-4">
									<div className="text-center py-4">
										<div className="text-5xl font-bold text-white mb-2">25</div>
										<div className="text-white/60">points</div>
									</div>
									<div className="text-center text-3xl font-bold text-blue-400">₹50</div>
									<div className="pt-4 space-y-3 border-t border-white/10 mt-6">
										<div className="text-sm text-white/70">
											<span className="text-white/50">• Standard generation speed</span>
										</div>
										<div className="text-sm text-white/70">
											<span className="text-white/50">• Standard support</span>
										</div>
									</div>
								</div>
								<Button
									className="w-full bg-white/5 hover:bg-white/10 backdrop-blur-lg border border-white/10 text-white transition-all duration-300 h-12 font-semibold mt-4"
									onClick={() => handlePurchase(25, "starter")}
									disabled={isProcessing}
								>
									{isProcessing && selectedOption === "starter" ? (
										"Processing..."
									) : (
										<>
											<Check className="h-4 w-4 mr-2" />
											Purchase
										</>
									)}
								</Button>
							</CardContent>
						</Card>

						{/* Option 2: 250 Tokens */}
						<Card className="relative flex flex-col border border-white/10 bg-black/20 transition-colors hover:bg-white/5">
							<CardHeader>
								<CardTitle className="text-white text-2xl">Pro Pack</CardTitle>
								<CardDescription className="text-white/60">Most popular choice</CardDescription>
							</CardHeader>
							<CardContent className="flex-1 flex flex-col">
								<div className="flex-1 space-y-4">
									<div className="text-center py-4">
										<div className="text-5xl font-bold text-white mb-2">250</div>
										<div className="text-white/60">points</div>
									</div>
									<div className="text-center">
										<div className="text-3xl font-bold text-blue-400">₹450</div>
										<div className="text-sm text-green-400 mt-1">Save 10%</div>
									</div>
									<div className="pt-4 space-y-3 border-t border-white/10 mt-6">
										<div className="text-sm text-white/80 flex items-start gap-2">
											<span className="text-green-400 mt-0.5">✓</span>
											<span>
												<span className="font-semibold">Ad-Free Experience</span> (30+ points)
											</span>
										</div>
										<div className="text-sm text-white/70">
											<span className="text-white/50">• Standard generation speed</span>
										</div>
									</div>
								</div>
								<Button
									className="w-full bg-white/5 hover:bg-white/10 backdrop-blur-lg border border-white/10 text-white transition-all duration-300 h-12 font-semibold mt-4"
									onClick={() => handlePurchase(250, "pro")}
									disabled={isProcessing}
								>
									{isProcessing && selectedOption === "pro" ? (
										"Processing..."
									) : (
										<>
											<Check className="h-4 w-4 mr-2" />
											Purchase
										</>
									)}
								</Button>
							</CardContent>
						</Card>

						{/* Option 3: 625 Tokens */}
						<div className="relative">
							<div className="absolute -top-3 right-3 z-10 rounded-full border border-blue-400/30 bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200">
								BEST VALUE
							</div>
							<Card className="flex flex-col border border-blue-400/30 bg-black/20 transition-colors hover:bg-white/5">
								<CardHeader>
									<CardTitle className="text-white text-2xl">Premium Pack</CardTitle>
									<CardDescription className="text-white/60">Maximum savings</CardDescription>
								</CardHeader>
								<CardContent className="flex-1 flex flex-col">
									<div className="flex-1 space-y-4">
										<div className="text-center py-4">
											<div className="text-5xl font-bold text-white mb-2">625</div>
											<div className="text-white/60">points</div>
										</div>
										<div className="text-center">
											<div className="text-3xl font-bold text-blue-400">₹1000</div>
											<div className="text-sm text-green-400 mt-1">Save 20%</div>
										</div>
										<div className="pt-4 space-y-3 border-t border-white/10 mt-6">
											<div className="text-sm text-white/80 flex items-start gap-2">
												<span className="text-green-400 mt-0.5">✓</span>
												<span>
													<span className="font-semibold">Ad-Free Experience</span> (30+ points)
												</span>
											</div>
											<div className="text-sm text-white/80 flex items-start gap-2">
												<span className="text-green-400 mt-0.5">✓</span>
												<span>
													<span className="font-semibold">Priority Throughput</span> (100+ points)
												</span>
											</div>
											<div className="text-sm text-white/70">
												<span className="text-white/50">• Maximum savings per token</span>
											</div>
										</div>
									</div>
									<Button
										className="w-full bg-blue-500/10 hover:bg-blue-500/20 backdrop-blur-lg border border-blue-500/30 text-white transition-all duration-300 h-12 font-semibold mt-4"
										onClick={() => handlePurchase(625, "premium")}
										disabled={isProcessing}
									>
										{isProcessing && selectedOption === "premium" ? (
											"Processing..."
										) : (
											<>
												<Check className="h-4 w-4 mr-2" />
												Purchase
											</>
										)}
									</Button>
								</CardContent>
							</Card>
						</div>

						{/* Option 4: Custom Amount */}
						<Card className="flex flex-col border border-white/10 bg-black/20 transition-colors hover:bg-white/5">
							<CardHeader>
								<CardTitle className="text-white text-2xl">Custom Amount</CardTitle>
								<CardDescription className="text-white/60">
									Choose your own (25-2500)
								</CardDescription>
							</CardHeader>
							<CardContent className="flex-1 flex flex-col">
								<div className="flex-1 space-y-4">
									<div className="text-center py-4">
										<div className="space-y-2">
											<Input
												id="customAmount"
												type="number"
												min="25"
												max="2500"
												placeholder="Enter number of points"
												value={customAmount}
												onChange={(e) => setCustomAmount(e.target.value)}
												onInput={(e) => {
													const target = e.target as HTMLInputElement;
													if (parseInt(target.value, 10) > 2500) {
														target.value = "2500";
														setCustomAmount("2500");
													}
												}}
												onKeyPress={(e) => {
													if (!/[0-9]/.test(e.key)) {
														e.preventDefault();
													}
												}}
												className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-center text-5xl h-20 font-bold"
											/>
											{customAmount && !isCustomAmountValid() && (
												<p className="text-red-400 text-sm">Must be 25-2500</p>
											)}
										</div>
									</div>
									{customAmount && isCustomAmountValid() && (
										<div className="text-center">
											<div className="text-3xl font-bold text-blue-400">
												₹{calculateCustomPrice(customAmount).toFixed(0)}
											</div>
											{parseInt(customAmount, 10) >= 625 && (
												<div className="text-sm text-green-400 mt-1">20% Discount Applied</div>
											)}
											{parseInt(customAmount, 10) >= 250 && parseInt(customAmount, 10) < 625 && (
												<div className="text-sm text-green-400 mt-1">10% Discount Applied</div>
											)}
										</div>
									)}
									{customAmount && isCustomAmountValid() && parseInt(customAmount, 10) >= 30 && (
										<div className="pt-4 space-y-3 border-t border-white/10">
											{parseInt(customAmount, 10) >= 30 && (
												<div className="text-sm text-white/80 flex items-start gap-2">
													<span className="text-green-400 mt-0.5">✓</span>
													<span>
														<span className="font-semibold">Ad-Free Experience</span>
													</span>
												</div>
											)}
											{parseInt(customAmount, 10) >= 100 && (
												<div className="text-sm text-white/80 flex items-start gap-2">
													<span className="text-green-400 mt-0.5">✓</span>
													<span>
														<span className="font-semibold">Priority Throughput</span>
													</span>
												</div>
											)}
										</div>
									)}
								</div>
								<Button
									className="w-full bg-white/5 hover:bg-white/10 backdrop-blur-lg border border-white/10 text-white transition-all duration-300 h-12 font-semibold mt-4"
									onClick={handleCustomPurchase}
									disabled={!isCustomAmountValid() || isProcessing}
								>
									{isProcessing && selectedOption === "custom" ? (
										"Processing..."
									) : (
										<>
											<Check className="h-4 w-4 mr-2" />
											Purchase
										</>
									)}
								</Button>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
