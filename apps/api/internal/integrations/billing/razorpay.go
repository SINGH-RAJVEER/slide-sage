// Package billing implements Razorpay order creation, payment lookup, and signature validation.
package billing

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const maxCustomQuantity = 10000

const razorpayBaseURL = "https://api.razorpay.com/v1"

var paymentIDPattern = regexp.MustCompile(`^pay_[A-Za-z0-9]{6,80}$`)

type Pack string

const (
	PackStarter Pack = "starter"
	PackPro     Pack = "pro"
	PackPremium Pack = "premium"
	PackCustom  Pack = "custom"
)

type Price struct{ Tokens, AmountPaise int }
type Order struct {
	OrderID     string
	AmountPaise int
	Currency    string
	Tokens      int
	KeyID       string
}
type CapturedPayment struct {
	PaymentID, OrderID string
	AmountPaise        int
	Currency           string
}

type RazorpayClient struct {
	KeyID, KeySecret string
	HTTPClient       *http.Client
	BaseURL          string
}

func NewRazorpayClientFromEnv() (*RazorpayClient, error) {
	client := &RazorpayClient{KeyID: os.Getenv("RAZORPAY_KEY_ID"), KeySecret: os.Getenv("RAZORPAY_KEY_SECRET")}
	if client.KeyID == "" || client.KeySecret == "" {
		return nil, errors.New("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set")
	}
	return client, nil
}

func ResolvePackPrice(pack Pack, quantity int) (Price, error) {
	switch pack {
	case PackStarter:
		return Price{25, 5000}, nil
	case PackPro:
		return Price{250, 45000}, nil
	case PackPremium:
		return Price{625, 100000}, nil
	case PackCustom:
		if quantity < 25 || quantity > maxCustomQuantity {
			return Price{}, errors.New("custom quantity must be an integer between 25 and 10000")
		}
		amount := quantity * 200
		if quantity >= 625 {
			amount = int(float64(amount) * .8)
		} else if quantity >= 250 {
			amount = int(float64(amount) * .9)
		}
		return Price{quantity, amount}, nil
	default:
		return Price{}, errors.New("invalid billing pack")
	}
}

func (c *RazorpayClient) CreateOrder(ctx context.Context, userID string, pack Pack, quantity int) (Order, error) {
	price, err := ResolvePackPrice(pack, quantity)
	if err != nil {
		return Order{}, err
	}
	receipt, err := randomReceipt()
	if err != nil {
		return Order{}, err
	}
	payload := map[string]any{"amount": price.AmountPaise, "currency": "INR", "receipt": receipt, "notes": map[string]string{"userId": userID, "pack": string(pack), "tokens": strconv.Itoa(price.Tokens)}, "partial_payment": false}
	var response struct {
		ID, Entity, Currency, Receipt, Status string
		Amount                                int
		AmountDue                             int `json:"amount_due"`
		AmountPaid                            int `json:"amount_paid"`
		PartialPayment                        bool `json:"partial_payment"`
	}
	if err := c.request(ctx, http.MethodPost, "/orders", payload, &response); err != nil {
		return Order{}, err
	}
	if response.ID == "" || response.Entity != "order" || response.Amount != price.AmountPaise || response.AmountDue != price.AmountPaise || response.AmountPaid != 0 || response.Currency != "INR" || response.Receipt != receipt || response.Status != "created" || response.PartialPayment {
		return Order{}, errors.New("Razorpay returned an invalid order")
	}
	return Order{response.ID, price.AmountPaise, "INR", price.Tokens, c.KeyID}, nil
}

func (c *RazorpayClient) FetchCapturedPayment(ctx context.Context, paymentID string) (*CapturedPayment, error) {
	if !paymentIDPattern.MatchString(paymentID) {
		return nil, errors.New("Razorpay payment ID is invalid")
	}
	var entity struct {
		ID                       string
		OrderID                  string `json:"order_id"`
		Amount                   int
		Currency, Status, Entity string
		Captured                 bool
	}
	if err := c.request(ctx, http.MethodGet, "/payments/"+paymentID, nil, &entity); err != nil {
		return nil, err
	}
	if entity.Entity != "payment" || entity.ID == "" || entity.OrderID == "" || entity.Amount <= 0 || entity.Currency != "INR" || entity.Status != "captured" || !entity.Captured {
		return nil, nil
	}
	return &CapturedPayment{entity.ID, entity.OrderID, entity.Amount, entity.Currency}, nil
}

// ParseCapturedWebhook validates the payment.captured payload after its raw body signature is verified.
func ParseCapturedWebhook(rawBody []byte) (*CapturedPayment, error) {
	var event struct {
		Event   string `json:"event"`
		Payload struct {
			Payment struct {
				Entity struct {
					ID       string `json:"id"`
					OrderID  string `json:"order_id"`
					Amount   int    `json:"amount"`
					Currency string `json:"currency"`
					Status   string `json:"status"`
					Entity   string `json:"entity"`
					Captured bool   `json:"captured"`
				} `json:"entity"`
			} `json:"payment"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(rawBody, &event); err != nil {
		return nil, errors.New("invalid webhook payload")
	}
	if event.Event != "payment.captured" {
		return nil, nil
	}
	payment := event.Payload.Payment.Entity
	if payment.Entity != "payment" || payment.ID == "" || payment.OrderID == "" || payment.Amount <= 0 || payment.Currency != "INR" || payment.Status != "captured" || !payment.Captured {
		return nil, errors.New("invalid captured payment")
	}
	return &CapturedPayment{payment.ID, payment.OrderID, payment.Amount, payment.Currency}, nil
}

func (c *RazorpayClient) request(ctx context.Context, method, path string, payload any, output any) error {
	if c.KeyID == "" || c.KeySecret == "" {
		return errors.New("Razorpay credentials are not configured")
	}
	var body *bytes.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(encoded)
	} else {
		body = bytes.NewReader(nil)
	}
	base := strings.TrimRight(c.BaseURL, "/")
	if base == "" {
		base = razorpayBaseURL
	}
	req, err := http.NewRequestWithContext(ctx, method, base+path, body)
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.KeyID, c.KeySecret)
	req.Header.Set("Accept", "application/json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	httpClient := c.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	res, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("Razorpay request: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return fmt.Errorf("Razorpay request failed with status %d", res.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(output)
}

func VerifyPaymentSignature(secret, orderID, paymentID, signature string) bool {
	return verifySignature(secret, orderID+"|"+paymentID, signature)
}
func VerifyWebhookSignature(secret string, rawBody []byte, signature string) bool {
	return verifySignature(secret, string(rawBody), signature)
}

func verifySignature(secret, message, signature string) bool {
	if secret == "" || len(signature) != 64 {
		return false
	}
	actual, err := hex.DecodeString(signature)
	if err != nil || len(actual) != sha256.Size {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(message))
	return subtle.ConstantTimeCompare(mac.Sum(nil), actual) == 1
}

func randomReceipt() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return "rcpt_" + hex.EncodeToString(value), nil
}
