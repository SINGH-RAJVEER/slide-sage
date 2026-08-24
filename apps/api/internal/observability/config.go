// Package observability wires OpenTelemetry signals (traces, metrics, and
// logs) into the SlideSage API and generation worker processes. Everything is
// configured through standard OTEL_* environment variables and exported over
// OTLP/gRPC; when no collector endpoint is configured the SDK stays disabled
// and processes run with local-only logging.
package observability

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config controls which telemetry providers Setup installs. The zero value
// yields a fully disabled telemetry instance that still returns usable loggers.
type Config struct {
	ServiceName    string  // OTEL_SERVICE_NAME
	ServiceVersion string  // OTEL_SERVICE_VERSION
	Environment    string  // OTEL_RESOURCE_ENVIRONMENT (deployment.environment)
	Endpoint       string  // OTEL_EXPORTER_OTLP_ENDPOINT
	Insecure       bool    // OTEL_EXPORTER_OTLP_INSECURE
	SamplingRatio  float64 // OTEL_TRACES_SAMPLING_RATIO
	MetricInterval int     // OTEL_METRIC_EXPORT_INTERVAL in milliseconds
	Disabled       bool    // true when OTEL_SDK_DISABLED or endpoint is unset
}

// ConfigFromEnv reads standard OpenTelemetry environment variables. It never
// fails: invalid numeric values fall back to their defaults so a mistyped env
// var cannot prevent an API process from starting.
func ConfigFromEnv() Config {
	return configFromEnv("slidesage-api")
}

// WorkerConfigFromEnv behaves like ConfigFromEnv but tags records with the
// worker service name so API and worker traces stay distinguishable.
func WorkerConfigFromEnv() Config {
	return configFromEnv("slidesage-worker")
}

func configFromEnv(defaultServiceName string) Config {
	config := Config{
		ServiceName:    strings.TrimSpace(os.Getenv("OTEL_SERVICE_NAME")),
		ServiceVersion: strings.TrimSpace(os.Getenv("OTEL_SERVICE_VERSION")),
		Environment:    strings.TrimSpace(os.Getenv("OTEL_RESOURCE_ENVIRONMENT")),
		Endpoint:       strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")),
		Insecure:       boolFromEnv("OTEL_EXPORTER_OTLP_INSECURE", false),
		SamplingRatio:  floatFromEnv("OTEL_TRACES_SAMPLING_RATIO", 1),
		MetricInterval: intFromEnv("OTEL_METRIC_EXPORT_INTERVAL", 60000),
	}
	if config.ServiceName == "" {
		config.ServiceName = defaultServiceName
	}
	if config.Environment == "" {
		config.Environment = firstNonEmpty(os.Getenv("ENVIRONMENT"), os.Getenv("NODE_ENV"), "development")
	}
	disabled := boolFromEnv("OTEL_SDK_DISABLED", false)
	if config.Endpoint == "" || disabled {
		config.Disabled = true
	}
	return config
}

// Validate rejects configurations that would silently drop telemetry, such as
// an enabled endpoint combined with an out-of-range sampling ratio. Export
// settings are ignored while the SDK is disabled.
func (config Config) Validate() error {
	if config.ServiceName == "" {
		return fmt.Errorf("service name must not be empty")
	}
	if config.Disabled {
		return nil
	}
	if config.SamplingRatio < 0 || config.SamplingRatio > 1 {
		return fmt.Errorf("sampling ratio %g must be between 0 and 1", config.SamplingRatio)
	}
	if config.MetricInterval < 1000 {
		return fmt.Errorf("metric export interval %dms must be at least 1000ms", config.MetricInterval)
	}
	return nil
}

func boolFromEnv(name string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func floatFromEnv(name string, fallback float64) float64 {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func intFromEnv(name string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
