package incident

import "testing"

func TestNormalizeMessage(t *testing.T) {
	tests := []struct {
		name, input, expected string
	}{
		{"ipv4 and port", "dial tcp 10.2.3.4:8080: refused", "dial tcp <ip>:<port>: refused"},
		{"time", "failed at 2026-07-24T12:13:14Z", "failed at <time>"},
		{"pod suffix", "pod payment-7df6d9c8b5-x2k9z failed", "pod payment-<pod> failed"},
		{"spaces and case", "  Readiness   PROBE failed ", "readiness probe failed"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := NormalizeMessage(tt.input); got != tt.expected {
				t.Fatalf("got %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestFingerprintIgnoresDynamicFields(t *testing.T) {
	a := Fingerprint("c1", "p1", "Unhealthy", "probe 10.0.0.1:8080 on payment-7df6d9c8b5-abcde")
	b := Fingerprint("c1", "p1", "Unhealthy", "probe 10.0.0.2:9090 on payment-7df6d9c8b5-fghij")
	if a != b {
		t.Fatalf("dynamic fields changed fingerprint: %s != %s", a, b)
	}
	if a == Fingerprint("c1", "p2", "Unhealthy", "probe 10.0.0.2:9090 on payment-7df6d9c8b5-fghij") {
		t.Fatal("resource UID must affect fingerprint")
	}
}
