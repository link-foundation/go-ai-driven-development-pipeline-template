// Package mypackage provides example arithmetic and utility functions.
// This is a template package demonstrating best practices for Go development.
package mypackage

import (
	"context"
	"time"
)

// Version represents the current version of this package.
// This is used for release automation and changelog management.
const Version = "0.1.0"

// Add returns the sum of two integers.
func Add(a, b int) int {
	return a + b
}

// AddFloat returns the sum of two float64 numbers.
func AddFloat(a, b float64) float64 {
	return a + b
}

// Multiply returns the product of two integers.
func Multiply(a, b int) int {
	return a * b
}

// MultiplyFloat returns the product of two float64 numbers.
func MultiplyFloat(a, b float64) float64 {
	return a * b
}

// Delay pauses execution for the specified duration.
// It respects context cancellation and returns an error if the context is cancelled.
func Delay(ctx context.Context, duration time.Duration) error {
	select {
	case <-time.After(duration):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// DelaySimple pauses execution for the specified duration without context support.
func DelaySimple(duration time.Duration) {
	time.Sleep(duration)
}
