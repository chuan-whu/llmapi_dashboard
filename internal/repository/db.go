package repository

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"llmapi-dashboard/internal/config"
	"llmapi-dashboard/internal/entities"
	"llmapi-dashboard/internal/timeutil"
)

// OpenDatabase creates a writable current-schema database for tests and local
// data preparation. The deployed application uses OpenReadOnlyDatabase instead.
func OpenDatabase(cfg config.Config) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open(sqliteDSN(cfg.SQLitePath)), &gorm.Config{NowFunc: func() time.Time { return timeutil.NormalizeStorageTime(time.Now()) }})
	if err != nil {
		return nil, fmt.Errorf("open sqlite database %s: %w", filepath.Clean(cfg.SQLitePath), err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("configure sqlite database: %w", err)
	}
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)

	if err := db.Exec("PRAGMA journal_mode=WAL").Error; err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("enable sqlite WAL: %w", err)
	}
	if err := db.Exec("PRAGMA busy_timeout=5000").Error; err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("set sqlite busy timeout: %w", err)
	}
	if err := db.Exec("PRAGMA foreign_keys=ON").Error; err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("enable sqlite foreign keys: %w", err)
	}
	if err := db.AutoMigrate(entities.All()...); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("auto migrate current database schema: %w", err)
	}
	return db, nil
}

// OpenReadOnlyDatabase opens an existing llmapi_dashboard SQLite database
// without schema writes.
func OpenReadOnlyDatabase(cfg config.Config) (*gorm.DB, error) {
	if exists, err := sqliteDatabaseFileExists(cfg.SQLitePath); err != nil {
		return nil, err
	} else if !exists {
		return nil, fmt.Errorf("sqlite database %s does not exist", filepath.Clean(cfg.SQLitePath))
	}

	db, err := gorm.Open(sqlite.Open(readOnlySQLiteDSN(cfg.SQLitePath)), &gorm.Config{NowFunc: func() time.Time { return timeutil.NormalizeStorageTime(time.Now()) }})
	if err != nil {
		return nil, fmt.Errorf("open read-only sqlite database %s: %w", filepath.Clean(cfg.SQLitePath), err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("configure read-only sqlite database: %w", err)
	}
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)

	if err := db.Exec("PRAGMA query_only=ON").Error; err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("enable sqlite read-only query mode: %w", err)
	}
	if err := db.Exec("PRAGMA busy_timeout=5000").Error; err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("set sqlite busy timeout: %w", err)
	}
	if err := db.Exec("PRAGMA foreign_keys=ON").Error; err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("enable sqlite foreign keys: %w", err)
	}
	if err := validateReadOnlyTables(db, cfg.SQLitePath); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	return db, nil
}

func validateReadOnlyTables(db *gorm.DB, path string) error {
	requiredTables := []string{
		"usage_events",
		"usage_overview_hourly_stats",
		"usage_overview_daily_stats",
		"usage_overview_health_stats",
	}
	missing := make([]string, 0)
	for _, table := range requiredTables {
		var count int64
		if err := db.Raw("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?", table).Scan(&count).Error; err != nil {
			return fmt.Errorf("check dashboard table %s: %w", table, err)
		}
		if count == 0 {
			missing = append(missing, table)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("sqlite database %s is not a supported llmapi_dashboard app.db; missing tables: %s", filepath.Clean(path), strings.Join(missing, ", "))
	}
	return nil
}

// sqliteDSN appends SQLite connection defaults unless the caller already passed a DSN.
func sqliteDSN(path string) string {
	trimmed := strings.TrimSpace(path)
	if strings.Contains(trimmed, "?") {
		return trimmed
	}
	return trimmed + "?_busy_timeout=5000&_foreign_keys=on"
}

func readOnlySQLiteDSN(path string) string {
	trimmed := strings.TrimSpace(path)
	if strings.HasPrefix(trimmed, "file:") {
		separator := "?"
		if strings.Contains(trimmed, "?") {
			separator = "&"
		}
		return trimmed + separator + "mode=ro&_busy_timeout=5000&_foreign_keys=on"
	}
	cleaned := filepath.ToSlash(trimmed)
	return "file:" + cleaned + "?mode=ro&_busy_timeout=5000&_foreign_keys=on"
}

// sqliteDatabaseFileExists checks physical database files. Memory databases are treated as absent.
func sqliteDatabaseFileExists(path string) (bool, error) {
	trimmed := strings.TrimSpace(path)
	if before, _, ok := strings.Cut(trimmed, "?"); ok {
		trimmed = before
	}
	if trimmed == "" || trimmed == ":memory:" {
		return false, nil
	}
	_, err := os.Stat(trimmed)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, fmt.Errorf("check sqlite database %s: %w", filepath.Clean(trimmed), err)
}

// InsertUsageEvents inserts events for tests and local data preparation.
func InsertUsageEvents(db *gorm.DB, events []entities.UsageEvent) (int, int, error) {
	if db == nil {
		return 0, 0, fmt.Errorf("database is nil")
	}
	if len(events) == 0 {
		return 0, 0, nil
	}

	inserted := 0

	err := db.Transaction(func(tx *gorm.DB) error {
		for start := 0; start < len(events); start += insertBatchSize(entities.UsageEvent{}) {
			end := min(start+insertBatchSize(entities.UsageEvent{}), len(events))
			batch := events[start:end]
			for index := range batch {
				batch[index].Timestamp = timeutil.NormalizeStorageTime(batch[index].Timestamp)
			}

			result := tx.Create(&batch)
			if result.Error != nil {
				return fmt.Errorf("insert usage events: %w", result.Error)
			}
			inserted += int(result.RowsAffected)
		}
		return nil
	})
	if err != nil {
		return 0, 0, err
	}

	return inserted, 0, nil
}
