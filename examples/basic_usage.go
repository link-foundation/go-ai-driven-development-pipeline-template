// Package main demonstrates basic usage of the mypackage library.
package main

import (
	"context"
	"fmt"
	"time"

	"github.com/link-foundation/go-ai-driven-development-pipeline-template/pkg/mypackage"
)

func main() {
	// Display version
	fmt.Printf("Package version: %s\n\n", mypackage.Version)

	// Integer arithmetic
	fmt.Println("=== Integer Arithmetic ===")
	sum := mypackage.Add(5, 3)
	fmt.Printf("Add(5, 3) = %d\n", sum)

	product := mypackage.Multiply(4, 7)
	fmt.Printf("Multiply(4, 7) = %d\n", product)

	// Float arithmetic
	fmt.Println("\n=== Float Arithmetic ===")
	floatSum := mypackage.AddFloat(2.5, 3.7)
	fmt.Printf("AddFloat(2.5, 3.7) = %.2f\n", floatSum)

	floatProduct := mypackage.MultiplyFloat(2.5, 4.0)
	fmt.Printf("MultiplyFloat(2.5, 4.0) = %.2f\n", floatProduct)

	// Delay with context
	fmt.Println("\n=== Delay Operations ===")
	ctx := context.Background()

	fmt.Println("Starting delay of 100ms...")
	start := time.Now()
	err := mypackage.Delay(ctx, 100*time.Millisecond)
	if err != nil {
		fmt.Printf("Delay error: %v\n", err)
	} else {
		fmt.Printf("Delay completed in %v\n", time.Since(start))
	}

	// Delay with cancellation
	fmt.Println("\nDemonstrating context cancellation...")
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	start = time.Now()
	err = mypackage.Delay(ctx, 1*time.Second)
	if err != nil {
		fmt.Printf("Delay cancelled after %v: %v\n", time.Since(start), err)
	}

	fmt.Println("\nDone!")
}
