package billing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type PaymentService struct{ DB *sql.DB }
type Fulfillment struct{ TokensGranted, NewBalance float64 }
type VerificationOrder struct {
	AmountPaise int
	Completed   *Fulfillment
}

var (
	ErrPaymentNotFound     = errors.New("payment order not found")
	ErrPaymentUnauthorized = errors.New("payment order belongs to another user")
	ErrPaymentInvalid      = errors.New("payment amount does not match order")
	ErrPaymentConflict     = errors.New("payment conflicts with existing order state")
)

func (s PaymentService) Balance(ctx context.Context, userID string) (float64, error) {
	if s.DB == nil {
		return 0, errors.New("database is required")
	}
	var balanceMillis int64
	err := s.DB.QueryRowContext(ctx, `SELECT balance_millis FROM users WHERE id = $1`, userID).Scan(&balanceMillis)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, errors.New("user not found")
	}
	return points(balanceMillis), err
}

func (s PaymentService) RecordOrder(ctx context.Context, userID string, order Order) error {
	if s.DB == nil {
		return errors.New("database is required")
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO payments (id, user_id, razorpay_order_id, amount_paise, tokens_granted_millis, status) VALUES (md5(random()::text || clock_timestamp()::text), $1, $2, $3, $4, 'created')`, userID, order.OrderID, order.AmountPaise, int64(order.Tokens)*1000)
	return err
}

func (s PaymentService) VerificationOrder(ctx context.Context, orderID, paymentID, expectedUserID string) (VerificationOrder, error) {
	var userID, status string
	var linked sql.NullString
	var amount int
	var tokensMillis int64
	err := s.DB.QueryRowContext(ctx, `SELECT user_id, status, razorpay_payment_id, amount_paise, tokens_granted_millis FROM payments WHERE razorpay_order_id = $1`, orderID).Scan(&userID, &status, &linked, &amount, &tokensMillis)
	if errors.Is(err, sql.ErrNoRows) {
		return VerificationOrder{}, ErrPaymentNotFound
	}
	if err != nil {
		return VerificationOrder{}, err
	}
	if userID != expectedUserID {
		return VerificationOrder{}, ErrPaymentUnauthorized
	}
	if status == "paid" {
		if !linked.Valid || linked.String != paymentID {
			return VerificationOrder{}, ErrPaymentConflict
		}
		balance, err := s.Balance(ctx, userID)
		if err != nil {
			return VerificationOrder{}, err
		}
		completed := &Fulfillment{TokensGranted: points(tokensMillis), NewBalance: balance}
		return VerificationOrder{AmountPaise: amount, Completed: completed}, nil
	}
	if status != "created" {
		return VerificationOrder{}, ErrPaymentConflict
	}
	return VerificationOrder{AmountPaise: amount}, nil
}

// Fulfill atomically claims a created payment and credits users.balance_millis once.
func (s PaymentService) Fulfill(ctx context.Context, payment CapturedPayment, expectedUserID string) (Fulfillment, error) {
	if s.DB == nil {
		return Fulfillment{}, errors.New("database is required")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return Fulfillment{}, err
	}
	defer tx.Rollback()
	query := `UPDATE payments SET razorpay_payment_id = $1, status = 'paid', updated_at = NOW() WHERE razorpay_order_id = $2 AND status = 'created' AND amount_paise = $3`
	args := []any{payment.PaymentID, payment.OrderID, payment.AmountPaise}
	if expectedUserID != "" {
		query += " AND user_id = $4"
		args = append(args, expectedUserID)
	}
	result, err := tx.ExecContext(ctx, query, args...)
	if err != nil {
		return Fulfillment{}, err
	}
	claimed, err := result.RowsAffected()
	if err != nil {
		return Fulfillment{}, err
	}
	if claimed == 1 {
		var userID string
		var paymentID string
		var tokensMillis int64
		if err := tx.QueryRowContext(ctx, `SELECT id, user_id, tokens_granted_millis FROM payments WHERE razorpay_order_id = $1`, payment.OrderID).Scan(&paymentID, &userID, &tokensMillis); err != nil {
			return Fulfillment{}, err
		}
		var balanceMillis int64
		if err := tx.QueryRowContext(ctx, `UPDATE users SET balance_millis = balance_millis + $1, updated_at = NOW() WHERE id = $2 RETURNING balance_millis`, tokensMillis, userID).Scan(&balanceMillis); err != nil {
			return Fulfillment{}, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO point_ledger (id, user_id, payment_id, entry_type, delta_millis, balance_after_millis) VALUES (md5(random()::text || clock_timestamp()::text), $1, $2, 'purchase_credit', $3, $4)`, userID, paymentID, tokensMillis, balanceMillis); err != nil {
			return Fulfillment{}, err
		}
		if err := tx.Commit(); err != nil {
			return Fulfillment{}, err
		}
		return Fulfillment{points(tokensMillis), points(balanceMillis)}, nil
	}
	var userID, status string
	var linked sql.NullString
	var amount int
	var tokensMillis int64
	err = tx.QueryRowContext(ctx, `SELECT user_id, status, razorpay_payment_id, amount_paise, tokens_granted_millis FROM payments WHERE razorpay_order_id = $1`, payment.OrderID).Scan(&userID, &status, &linked, &amount, &tokensMillis)
	if errors.Is(err, sql.ErrNoRows) {
		return Fulfillment{}, ErrPaymentNotFound
	}
	if err != nil {
		return Fulfillment{}, err
	}
	if expectedUserID != "" && expectedUserID != userID {
		return Fulfillment{}, ErrPaymentUnauthorized
	}
	if amount != payment.AmountPaise {
		return Fulfillment{}, ErrPaymentInvalid
	}
	if status != "paid" || !linked.Valid || linked.String != payment.PaymentID {
		return Fulfillment{}, ErrPaymentConflict
	}
	var balanceMillis int64
	if err := tx.QueryRowContext(ctx, `SELECT balance_millis FROM users WHERE id = $1`, userID).Scan(&balanceMillis); err != nil {
		return Fulfillment{}, fmt.Errorf("load payment balance: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Fulfillment{}, err
	}
	return Fulfillment{points(tokensMillis), points(balanceMillis)}, nil
}

func points(millis int64) float64 {
	return float64(millis) / 1000
}
