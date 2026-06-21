package helper

import (
	"strings"

	"llmapi-dashboard/internal/entities"
)

const sensitiveValueMask = "*********"
const apiKeyDisplayMask = "*****************"

// RedactSensitiveValue 使用统一格式隐藏前端展示中的敏感值：长值保留前 3 位和后 6 位，短值全隐藏。
func RedactSensitiveValue(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || trimmed == "unknown" {
		return "unknown"
	}
	runes := []rune(trimmed)
	if len(runes) <= 9 {
		return sensitiveValueMask
	}
	return string(runes[:3]) + sensitiveValueMask + string(runes[len(runes)-6:])
}

// APIKeyMaskedDisplayKey 返回 API Key 的安全展示值；优先基于原始 key 重新脱敏，避免历史 DisplayKey 格式不一致。
func APIKeyMaskedDisplayKey(row entities.APIKey) string {
	if strings.TrimSpace(row.APIKey) != "" {
		return MaskAPIKeyForDisplay(row.APIKey)
	}
	return strings.TrimSpace(row.DisplayKey)
}

// APIKeyDisplayName 返回 API Key 的前端展示名。别名只保存在库里，不对看板展示。
func APIKeyDisplayName(row entities.APIKey) string {
	return APIKeyMaskedDisplayKey(row)
}

// MaskAPIKeyForDisplay masks API keys for dashboard labels while preserving
// enough prefix/suffix to distinguish keys without exposing aliases or secrets.
func MaskAPIKeyForDisplay(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || trimmed == "unknown" {
		return "unknown"
	}
	runes := []rune(trimmed)
	if len(runes) <= 8 {
		return sensitiveValueMask
	}
	return string(runes[:4]) + apiKeyDisplayMask + string(runes[len(runes)-4:])
}
