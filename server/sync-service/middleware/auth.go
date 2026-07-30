// @ai-context
// JWT 认证中间件（Supabase RS256）：HTTP 走 Authorization 头，WebSocket 走 ?token= 查询参数。
// JWT auth middleware (Supabase RS256): HTTP uses Authorization header, WebSocket uses ?token= query.
// Why: 浏览器无法在 WebSocket 升级请求上设置自定义头，故需独立的 WSAuthMiddleware。
package middleware

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// rsaPublicKey 缓存解析后的 RSA 公钥，避免每次请求重复解析
var rsaPublicKey *rsa.PublicKey

// getRSAPublicKey 从环境变量 SUPABASE_JWT_SECRET 读取 PEM 格式公钥并解析。
// 解析失败时 log.Fatal 退出；未配置时返回 nil 并打印警告。
func getRSAPublicKey() *rsa.PublicKey {
	if rsaPublicKey != nil {
		return rsaPublicKey
	}

	pemStr := os.Getenv("SUPABASE_JWT_SECRET")
	if pemStr == "" {
		log.Println("[WARN] SUPABASE_JWT_SECRET 未配置，JWT 验证将失败。" +
			"请从 Supabase Dashboard > Settings > API > JWT Settings 获取 RSA 公钥。")
		return nil
	}

	// 尝试解析 PEM 块
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		log.Fatal("[FATAL] SUPABASE_JWT_SECRET 不是有效的 PEM 格式，请检查环境变量配置")
	}

	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		log.Fatalf("[FATAL] 无法解析 RSA 公钥: %v", err)
	}

	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok {
		log.Fatal("[FATAL] SUPABASE_JWT_SECRET 中的公钥不是 RSA 类型")
	}

	rsaPublicKey = rsaPub
	return rsaPublicKey
}

// AuthMiddleware validates JWT Bearer tokens（RS256 / Supabase JWT）
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "missing authorization header",
			})
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "invalid authorization format",
			})
			c.Abort()
			return
		}

		tokenString := parts[1]
		userID := validateJWT(tokenString, c)
		if userID == "" {
			return // response already written
		}

		c.Set("auth_token", tokenString)
		c.Set("user_id", userID)
		c.Next()
	}
}

// WSAuthMiddleware authenticates WebSocket connections via a `token` query parameter.
// Browsers cannot set custom headers on WebSocket upgrade requests, so the JWT
// must be passed as ?token=<jwt> instead of the Authorization header.
func WSAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.Query("token")
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "missing token query parameter",
			})
			c.Abort()
			return
		}

		userID := validateJWT(tokenString, c)
		if userID == "" {
			return
		}

		c.Set("auth_token", tokenString)
		c.Set("user_id", userID)
		c.Next()
	}
}

// validateJWT parses and validates a JWT token string. On success it returns the
// user_id (sub claim). On failure it writes a JSON error response and returns "".
func validateJWT(tokenString string, c *gin.Context) string {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		pubKey := getRSAPublicKey()
		if pubKey == nil {
			return nil, jwt.ErrSignatureInvalid
		}
		return pubKey, nil
	})

	if err != nil || !token.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "invalid or expired token",
		})
		c.Abort()
		return ""
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "invalid token claims",
		})
		c.Abort()
		return ""
	}

	userID, ok := claims["sub"].(string)
	if !ok || userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "token missing user identifier (sub)",
		})
		c.Abort()
		return ""
	}

	return userID
}
