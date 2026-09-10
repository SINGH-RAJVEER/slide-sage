package billing

import (
	"net/http"
	"testing"
)

func TestNewRazorpayClientFromEnvRequiresEveryCredential(t *testing.T) {
	credentials := map[string]string{
		"RAZORPAY_KEY_ID":         "key",
		"RAZORPAY_KEY_SECRET":     "secret",
		"RAZORPAY_WEBHOOK_SECRET": "webhook-secret",
	}
	for missing := range credentials {
		t.Run(missing, func(t *testing.T) {
			for name, value := range credentials {
				t.Setenv(name, value)
			}
			t.Setenv(missing, "")

			if _, err := NewRazorpayClientFromEnv(); err == nil {
				t.Fatalf("expected missing %s to fail", missing)
			}
		})
	}
}

func TestNewRazorpayClientFromEnvLoadsEveryCredential(t *testing.T) {
	t.Setenv("RAZORPAY_KEY_ID", "key")
	t.Setenv("RAZORPAY_KEY_SECRET", "secret")
	t.Setenv("RAZORPAY_WEBHOOK_SECRET", "webhook-secret")

	client, err := NewRazorpayClientFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if client.KeyID != "key" || client.KeySecret != "secret" || client.WebhookSecret != "webhook-secret" {
		t.Fatalf("unexpected client credentials: %#v", client)
	}
}

func TestRegisterRoutesRequiresRazorpayClient(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("expected nil Razorpay client to panic")
		}
	}()

	RegisterRoutes(http.NewServeMux(), PaymentService{}, nil, nil)
}

func TestPaymentSignature(t *testing.T) {
	if !VerifyPaymentSignature("secret", "order_123", "pay_123456", "863467872e3bf30f778859597e5dcab8c63849c543e940422d044303cad1c8c2") {
		t.Fatal("valid signature rejected")
	}
	if VerifyPaymentSignature("secret", "order_123", "pay_123456", "bad") {
		t.Fatal("invalid signature accepted")
	}
}

func TestResolvePackPrice(t *testing.T) {
	price, err := ResolvePackPrice(PackCustom, 625)
	if err != nil {
		t.Fatal(err)
	}
	if price.Tokens != 625 || price.AmountPaise != 100000 {
		t.Fatalf("price: %#v", price)
	}
}

func TestResolvePackPriceAllowsMaximumCustomQuantity(t *testing.T) {
	price, err := ResolvePackPrice(PackCustom, maxCustomQuantity)
	if err != nil {
		t.Fatal(err)
	}
	if price.Tokens != maxCustomQuantity || price.AmountPaise != 1600000 {
		t.Fatalf("price: %#v", price)
	}
}
