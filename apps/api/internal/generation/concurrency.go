package generation

import (
	"context"
	"errors"

	"golang.org/x/sync/errgroup"
)

func runBounded[T any](ctx context.Context, limit int, items []T, run func(context.Context, T) error) error {
	if limit < 1 {
		limit = 1
	}
	itemErrors := make([]error, len(items))
	var group errgroup.Group
	var dispatchError error
	group.SetLimit(limit)
	for index, item := range items {
		if err := ctx.Err(); err != nil {
			dispatchError = err
			break
		}
		index, item := index, item
		group.Go(func() error {
			itemErrors[index] = run(ctx, item)
			return nil
		})
	}
	_ = group.Wait()
	return errors.Join(errors.Join(itemErrors...), dispatchError)
}
