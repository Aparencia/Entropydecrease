// @ai-context
// PostgreSQL 连接初始化与自动迁移。PostgreSQL connection bootstrap and auto-migration.
// Why: DSN 默认值中的 keban 库名/用户名属用户数据标识，永久豁免品牌重命名（跨版本数据兼容）。
package models

import (
	"fmt"
	"log"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB is the global database handle.
var DB *gorm.DB

// InitDB opens the PostgreSQL connection and runs auto-migration.
// It should be called once at startup (before registering routes).
func InitDB() error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://keban:keban_dev@localhost:5432/keban?sslmode=disable"
	}

	// Choose log level based on GIN_MODE: silent in release, info otherwise.
	gormLogLevel := logger.Warn
	if os.Getenv("GIN_MODE") != "release" {
		gormLogLevel = logger.Info
	}

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(gormLogLevel),
	})
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// M4: 配置连接池（上限 50 并发连接，空闲 25，单连接最长 30 分钟）
	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get underlying sql.DB: %w", err)
	}
	sqlDB.SetMaxOpenConns(50)
	sqlDB.SetMaxIdleConns(25)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)

	// Auto-migrate all models.
	if err := DB.AutoMigrate(&EntityVersion{}, &Operation{}, &GlobalSeqNo{}, &CRDTChange{}); err != nil {
		return fmt.Errorf("auto-migration failed: %w", err)
	}

	// Seed the GlobalSeqNo row if it doesn't exist yet.
	var count int64
	// M9: 不再吞没 Count 错误，失败时直接中止启动
	if err := DB.Model(&GlobalSeqNo{}).Count(&count).Error; err != nil {
		return fmt.Errorf("failed to count GlobalSeqNo: %w", err)
	}
	if count == 0 {
		if err := DB.Create(&GlobalSeqNo{SeqNo: 0}).Error; err != nil {
			return fmt.Errorf("failed to seed GlobalSeqNo: %w", err)
		}
		log.Println("[sync-service] Seeded GlobalSeqNo = 0")
	}

	log.Println("[sync-service] Database connection established")
	return nil
}
