package generation

import (
	"sync"
)

type streamLimiter struct {
	mu         sync.Mutex
	total      int
	maxTotal   int
	maxPerUser int
	byUser     map[string]int
}

func newStreamLimiter(maxTotal, maxPerUser int) *streamLimiter {
	return &streamLimiter{maxTotal: maxTotal, maxPerUser: maxPerUser, byUser: map[string]int{}}
}

func (limiter *streamLimiter) acquire(userID string) bool {
	if limiter == nil {
		return true
	}
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	if limiter.total >= limiter.maxTotal || limiter.byUser[userID] >= limiter.maxPerUser {
		return false
	}
	limiter.total++
	limiter.byUser[userID]++
	return true
}

func (limiter *streamLimiter) release(userID string) {
	if limiter == nil {
		return
	}
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	if limiter.byUser[userID] == 0 {
		return
	}
	limiter.total--
	limiter.byUser[userID]--
	if limiter.byUser[userID] == 0 {
		delete(limiter.byUser, userID)
	}
}
