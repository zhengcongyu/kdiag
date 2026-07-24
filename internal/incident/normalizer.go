package incident

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
	"time"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

var (
	ipPattern      = regexp.MustCompile(`\b(?:\d{1,3}\.){3}\d{1,3}\b`)
	ipv6Pattern    = regexp.MustCompile(`\b[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{0,4}){2,7}\b`)
	portPattern    = regexp.MustCompile(`(?i)(port[ =:]*)\d{2,5}\b|:\d{2,5}\b`)
	timePattern    = regexp.MustCompile(`(?i)\b\d{4}-\d\d-\d\d[t ][0-9:.+-]+z?\b|\b\d{1,2}:\d{2}:\d{2}\b`)
	podHashPattern = regexp.MustCompile(`\b([a-z0-9](?:[-a-z0-9]*[a-z0-9])?)-[a-f0-9]{8,10}-[a-z0-9]{5}\b`)
	spacePattern   = regexp.MustCompile(`\s+`)
)

func NormalizeMessage(message string) string {
	value := strings.ToLower(strings.TrimSpace(message))
	value = timePattern.ReplaceAllString(value, "<time>")
	value = ipPattern.ReplaceAllString(value, "<ip>")
	value = ipv6Pattern.ReplaceAllString(value, "<ip>")
	value = portPattern.ReplaceAllStringFunc(value, func(match string) string {
		if strings.HasPrefix(match, ":") {
			return ":<port>"
		}
		prefix := regexp.MustCompile(`\d+$`).ReplaceAllString(match, "")
		return prefix + "<port>"
	})
	value = podHashPattern.ReplaceAllString(value, "$1-<pod>")
	return spacePattern.ReplaceAllString(value, " ")
}

func Fingerprint(cluster, resourceUID, reason, message string) string {
	sum := sha256.Sum256([]byte(strings.Join([]string{
		cluster, resourceUID, strings.ToLower(reason), NormalizeMessage(message),
	}, "\x00")))
	return hex.EncodeToString(sum[:])
}

type Event struct {
	Cluster   string
	Resource  model.ResourceRef
	Reason    string
	Message   string
	FirstSeen time.Time
	LastSeen  time.Time
	Count     int64
}

func NormalizeEvent(event Event) model.Signal {
	normalized := NormalizeMessage(event.Message)
	return model.Signal{
		ID:      event.Resource.UID + ":" + event.Reason,
		Cluster: event.Cluster, Resource: event.Resource, Reason: event.Reason,
		Message: event.Message, NormalizedMessage: normalized,
		Fingerprint: Fingerprint(event.Cluster, event.Resource.UID, event.Reason, normalized),
		FirstSeen:   event.FirstSeen.UTC(), LastSeen: event.LastSeen.UTC(), Count: event.Count,
	}
}

type SignalAccumulator struct {
	byFingerprint map[string]model.Signal
}

func NewSignalAccumulator() *SignalAccumulator {
	return &SignalAccumulator{byFingerprint: map[string]model.Signal{}}
}

func (a *SignalAccumulator) Add(signal model.Signal) model.Signal {
	if current, ok := a.byFingerprint[signal.Fingerprint]; ok {
		if signal.FirstSeen.Before(current.FirstSeen) {
			current.FirstSeen = signal.FirstSeen
		}
		if signal.LastSeen.After(current.LastSeen) {
			current.LastSeen = signal.LastSeen
			current.Message = signal.Message
		}
		current.Count += signal.Count
		a.byFingerprint[signal.Fingerprint] = current
		return current
	}
	a.byFingerprint[signal.Fingerprint] = signal
	return signal
}
