package main

import "testing"

func TestCanonicalKind(t *testing.T) {
	for input, expected := range map[string]string{"svc": "Service", "pod": "Pod", "PVC": "PersistentVolumeClaim"} {
		if got := canonicalKind(input); got != expected {
			t.Fatalf("%s: got %s", input, got)
		}
	}
	if canonicalKind("secret") != "" {
		t.Fatal("Secret must not be diagnosable through this CLI")
	}
}
