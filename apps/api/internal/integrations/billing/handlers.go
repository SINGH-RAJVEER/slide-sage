package billing

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
)

const (
	billingBodyLimit int64 = 32 * 1024
	webhookBodyLimit int64 = 256 * 1024
)

// Identity resolves the authenticated user ID for routes that require JWT auth.
// It should return an error for missing, expired, or invalid credentials.
type Identity func(*http.Request) (string, error)

// RegisterRoutes adds all current /billing routes to mux. The caller owns
// authentication implementation and constructs dependencies during application startup.
func RegisterRoutes(mux *http.ServeMux, payments PaymentService, razorpay *RazorpayClient, identity Identity) {
	if mux == nil {
		panic("billing mux is required")
	}
	router := billingRouter{payments: payments, razorpay: razorpay, identity: identity}
	mux.HandleFunc("GET /billing/balance", router.balance)
	mux.HandleFunc("POST /billing/checkout", router.checkout)
	mux.HandleFunc("POST /billing/verify", router.verify)
	mux.HandleFunc("POST /billing/webhook", router.webhook)
}

type billingRouter struct {
	payments PaymentService
	razorpay *RazorpayClient
	identity Identity
}

func (r billingRouter) balance(w http.ResponseWriter, request *http.Request) {
	userID, ok := r.userID(w, request)
	if !ok {
		return
	}
	balance, err := r.payments.Balance(request.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]float64{"slide_tokens": balance})
}

func (r billingRouter) checkout(w http.ResponseWriter, request *http.Request) {
	userID, ok := r.userID(w, request)
	if !ok {
		return
	}
	var input struct {
		Pack     string `json:"pack"`
		Quantity *int   `json:"quantity"`
	}
	if err := decodeJSON(request, billingBodyLimit, &input); err != nil {
		writeError(w, statusForJSONError(err), "Invalid request body")
		return
	}
	pack := Pack(input.Pack)
	if pack != PackStarter && pack != PackPro && pack != PackPremium && pack != PackCustom {
		writeError(w, http.StatusBadRequest, "Invalid pack")
		return
	}
	quantity := 0
	if input.Quantity != nil {
		quantity = *input.Quantity
	}
	if pack == PackCustom && (input.Quantity == nil || quantity < 25 || quantity > maxCustomQuantity) {
		writeError(w, http.StatusBadRequest, "Custom quantity must be 25-10000")
		return
	}
	if r.razorpay == nil {
		writeError(w, http.StatusInternalServerError, "Failed to create order")
		return
	}
	order, err := r.razorpay.CreateOrder(request.Context(), userID, pack, quantity)
	if err == nil {
		err = r.payments.RecordOrder(request.Context(), userID, order)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create order")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"orderId": order.OrderID, "amount": order.AmountPaise, "currency": order.Currency, "tokens": order.Tokens, "keyId": order.KeyID})
}

func (r billingRouter) verify(w http.ResponseWriter, request *http.Request) {
	userID, ok := r.userID(w, request)
	if !ok {
		return
	}
	var input struct {
		OrderID   string `json:"razorpay_order_id"`
		PaymentID string `json:"razorpay_payment_id"`
		Signature string `json:"razorpay_signature"`
	}
	if err := decodeJSON(request, billingBodyLimit, &input); err != nil {
		writeError(w, statusForJSONError(err), "Invalid request body")
		return
	}
	if strings.TrimSpace(input.OrderID) == "" || strings.TrimSpace(input.PaymentID) == "" || strings.TrimSpace(input.Signature) == "" {
		writeError(w, http.StatusBadRequest, "Missing payment details")
		return
	}
	if r.razorpay == nil || !VerifyPaymentSignature(r.razorpay.KeySecret, input.OrderID, input.PaymentID, input.Signature) {
		writeError(w, http.StatusBadRequest, "Invalid payment signature")
		return
	}
	localOrder, err := r.payments.VerificationOrder(request.Context(), input.OrderID, input.PaymentID, userID)
	if err != nil {
		r.fulfillmentError(w, err)
		return
	}
	if localOrder.Completed != nil {
		writeJSON(w, http.StatusOK, map[string]any{"success": true, "tokens_awarded": localOrder.Completed.TokensGranted, "new_balance": localOrder.Completed.NewBalance})
		return
	}
	providerPayment, err := r.razorpay.FetchCapturedPayment(request.Context(), input.PaymentID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Payment verification failed")
		return
	}
	if providerPayment == nil || providerPayment.PaymentID != input.PaymentID || providerPayment.OrderID != input.OrderID || providerPayment.AmountPaise != localOrder.AmountPaise {
		writeError(w, http.StatusBadRequest, "Payment details do not match order")
		return
	}
	result, err := r.payments.Fulfill(request.Context(), *providerPayment, userID)
	if err != nil {
		r.fulfillmentError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "tokens_awarded": result.TokensGranted, "new_balance": result.NewBalance})
}

func (r billingRouter) webhook(w http.ResponseWriter, request *http.Request) {
	rawBody, err := readLimitedBody(request, webhookBodyLimit)
	if err != nil {
		writeError(w, statusForJSONError(err), "Request body is too large")
		return
	}
	if !VerifyWebhookSignature(os.Getenv("RAZORPAY_WEBHOOK_SECRET"), rawBody, request.Header.Get("x-razorpay-signature")) {
		writeError(w, http.StatusBadRequest, "Invalid webhook signature")
		return
	}
	payment, err := ParseCapturedWebhook(rawBody)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid captured payment")
		return
	}
	if payment == nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}
	if _, err := r.payments.Fulfill(request.Context(), *payment, ""); err != nil {
		if errors.Is(err, ErrPaymentNotFound) {
			writeError(w, http.StatusServiceUnavailable, "Order not found")
			return
		}
		r.fulfillmentError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (r billingRouter) userID(w http.ResponseWriter, request *http.Request) (string, bool) {
	if r.identity == nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return "", false
	}
	userID, err := r.identity(request)
	if err != nil || strings.TrimSpace(userID) == "" {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return "", false
	}
	return userID, true
}

func (r billingRouter) fulfillmentError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrPaymentNotFound):
		writeError(w, http.StatusNotFound, "Order not found")
	case errors.Is(err, ErrPaymentUnauthorized):
		writeError(w, http.StatusForbidden, "Unauthorized")
	case errors.Is(err, ErrPaymentInvalid):
		writeError(w, http.StatusBadRequest, "Payment details do not match order")
	case errors.Is(err, ErrPaymentConflict):
		writeError(w, http.StatusConflict, "Payment is already linked differently")
	default:
		writeError(w, http.StatusInternalServerError, "Payment verification failed")
	}
}

func decodeJSON(request *http.Request, limit int64, output any) error {
	rawBody, err := readLimitedBody(request, limit)
	if err != nil {
		return err
	}
	decoder := json.NewDecoder(strings.NewReader(string(rawBody)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(output); err != nil {
		return err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("request body must contain one JSON value")
	}
	return nil
}

func readLimitedBody(request *http.Request, limit int64) ([]byte, error) {
	body := http.MaxBytesReader(nil, request.Body, limit)
	defer body.Close()
	return io.ReadAll(body)
}

func statusForJSONError(err error) int {
	var maxBytes *http.MaxBytesError
	if errors.As(err, &maxBytes) {
		return http.StatusRequestEntityTooLarge
	}
	return http.StatusBadRequest
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"message": message}})
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
