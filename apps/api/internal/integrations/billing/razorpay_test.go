package billing

import "testing"

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
