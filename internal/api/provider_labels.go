package api

import (
	"fmt"
	"sort"
	"strings"

	"cpa-usage-keeper/internal/entities"
)

type providerAccountLabels struct {
	byIdentity map[string]string
	byID       map[int64]string
}

func newProviderAccountLabels(identities []entities.UsageIdentity) providerAccountLabels {
	type entry struct {
		id       int64
		identity string
	}
	entries := make([]entry, 0, len(identities))
	for _, identity := range identities {
		if identity.AuthType != entities.UsageIdentityAuthTypeAIProvider || identity.IsDeleted {
			continue
		}
		if strings.TrimSpace(identity.Identity) == "" {
			continue
		}
		entries = append(entries, entry{
			id:       identity.ID,
			identity: strings.TrimSpace(identity.Identity),
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].id == entries[j].id {
			return entries[i].identity < entries[j].identity
		}
		return entries[i].id < entries[j].id
	})

	labels := providerAccountLabels{
		byIdentity: make(map[string]string, len(entries)),
		byID:       make(map[int64]string, len(entries)),
	}
	for index, entry := range entries {
		label := fmt.Sprintf("AI account %d", index+1)
		labels.byIdentity[entry.identity] = label
		if entry.id > 0 {
			labels.byID[entry.id] = label
		}
	}
	return labels
}

func (l providerAccountLabels) labelFor(identity entities.UsageIdentity) string {
	if identity.ID > 0 {
		if label, ok := l.byID[identity.ID]; ok {
			return label
		}
	}
	if label, ok := l.byIdentity[strings.TrimSpace(identity.Identity)]; ok {
		return label
	}
	return "AI account 1"
}
