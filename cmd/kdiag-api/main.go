package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/zhengcongyu/kdiag/internal/api"
	"github.com/zhengcongyu/kdiag/internal/repository"
)

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--healthcheck" {
		response, err := (&http.Client{Timeout: 2 * time.Second}).Get("http://127.0.0.1:8080/api/v1/health")
		if err != nil || response.StatusCode != http.StatusOK {
			fmt.Fprintln(os.Stderr, "healthcheck failed")
			os.Exit(1)
		}
		_ = response.Body.Close()
		return
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	var repo repository.Repository
	var closeRepository func()
	if databaseURL := os.Getenv("KDIAG_DATABASE_URL"); databaseURL != "" {
		postgres, err := repository.OpenPostgres(context.Background(), databaseURL)
		if err != nil {
			logger.Error("database_startup_failed", "error", err)
			os.Exit(1)
		}
		repo, closeRepository = postgres, postgres.Close
	} else {
		logger.Warn("using_in_memory_repository", "reason", "KDIAG_DATABASE_URL is empty")
		repo, closeRepository = repository.NewMemory(), func() {}
	}
	defer closeRepository()

	address := os.Getenv("KDIAG_LISTEN_ADDRESS")
	if address == "" {
		address = ":8080"
	}
	httpServer := &http.Server{
		Addr: address, Handler: api.New(repo, logger).Handler(),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		// WriteTimeout is intentionally zero because diagnosis SSE streams may
		// outlive a fixed response timeout. Per-task contexts bound execution.
		WriteTimeout: 0, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20,
	}
	go func() {
		logger.Info("api_started", "address", address)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("api_failed", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		logger.Error("shutdown_failed", "error", err)
		os.Exit(1)
	}
	logger.Info("api_stopped")
}
