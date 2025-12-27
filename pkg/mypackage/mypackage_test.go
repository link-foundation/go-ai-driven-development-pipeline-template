package mypackage

import (
	"context"
	"testing"
	"time"
)

func TestAdd(t *testing.T) {
	tests := []struct {
		name     string
		a, b     int
		expected int
	}{
		{"positive numbers", 2, 3, 5},
		{"with zero", 5, 0, 5},
		{"negative numbers", -2, -3, -5},
		{"mixed signs", -2, 5, 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Add(tt.a, tt.b)
			if result != tt.expected {
				t.Errorf("Add(%d, %d) = %d; want %d", tt.a, tt.b, result, tt.expected)
			}
		})
	}
}

func TestAddFloat(t *testing.T) {
	tests := []struct {
		name     string
		a, b     float64
		expected float64
	}{
		{"positive floats", 2.5, 3.5, 6.0},
		{"with zero", 5.5, 0.0, 5.5},
		{"negative floats", -2.5, -3.5, -6.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := AddFloat(tt.a, tt.b)
			if result != tt.expected {
				t.Errorf("AddFloat(%f, %f) = %f; want %f", tt.a, tt.b, result, tt.expected)
			}
		})
	}
}

func TestMultiply(t *testing.T) {
	tests := []struct {
		name     string
		a, b     int
		expected int
	}{
		{"positive numbers", 2, 3, 6},
		{"with zero", 5, 0, 0},
		{"negative numbers", -2, -3, 6},
		{"mixed signs", -2, 5, -10},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Multiply(tt.a, tt.b)
			if result != tt.expected {
				t.Errorf("Multiply(%d, %d) = %d; want %d", tt.a, tt.b, result, tt.expected)
			}
		})
	}
}

func TestMultiplyFloat(t *testing.T) {
	tests := []struct {
		name     string
		a, b     float64
		expected float64
	}{
		{"positive floats", 2.0, 3.0, 6.0},
		{"with zero", 5.5, 0.0, 0.0},
		{"fractional result", 2.5, 2.0, 5.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MultiplyFloat(tt.a, tt.b)
			if result != tt.expected {
				t.Errorf("MultiplyFloat(%f, %f) = %f; want %f", tt.a, tt.b, result, tt.expected)
			}
		})
	}
}

func TestDelay(t *testing.T) {
	t.Run("completes after duration", func(t *testing.T) {
		ctx := context.Background()
		start := time.Now()
		err := Delay(ctx, 50*time.Millisecond)
		elapsed := time.Since(start)

		if err != nil {
			t.Errorf("Delay() returned error: %v", err)
		}
		if elapsed < 50*time.Millisecond {
			t.Errorf("Delay() completed too quickly: %v", elapsed)
		}
	})

	t.Run("respects context cancellation", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())

		go func() {
			time.Sleep(10 * time.Millisecond)
			cancel()
		}()

		start := time.Now()
		err := Delay(ctx, 1*time.Second)
		elapsed := time.Since(start)

		if err != context.Canceled {
			t.Errorf("Delay() should return context.Canceled, got: %v", err)
		}
		if elapsed >= 1*time.Second {
			t.Errorf("Delay() should have been cancelled early, took: %v", elapsed)
		}
	})
}

func TestDelaySimple(t *testing.T) {
	start := time.Now()
	DelaySimple(50 * time.Millisecond)
	elapsed := time.Since(start)

	if elapsed < 50*time.Millisecond {
		t.Errorf("DelaySimple() completed too quickly: %v", elapsed)
	}
}

func TestVersion(t *testing.T) {
	if Version == "" {
		t.Error("Version should not be empty")
	}
}
