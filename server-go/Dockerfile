# ── 构建阶段 ──
# 用官方 Go 镜像编译静态二进制。GB/T 规则文档通过 go:embed 打进二进制，
# 因此运行镜像里不需要再拷贝任何 markdown。
# 版本需与 go.mod 的 go 指令一致（当前依赖 go-redis v9.23 要求 1.26）
FROM golang:1.26-alpine AS builder

WORKDIR /build

# 先只拷依赖清单，让依赖层能被缓存
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO_ENABLED=0 生成静态链接二进制，才能跑在 alpine/scratch 上
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# ── 运行阶段 ──
FROM alpine:3.20

# ca-certificates：调用 DashScope 的 HTTPS 接口需要根证书
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -u 10001 appuser

WORKDIR /app

COPY --from=builder /out/api /app/api

# 向量缓存落盘目录（对应 DATA_DIR），挂卷可持久化
RUN mkdir -p /app/data && chown -R appuser:appuser /app
VOLUME ["/app/data"]

USER appuser

EXPOSE 3001

ENV PORT=3001 \
    DATA_DIR=/app/data \
    LOG_LEVEL=info

# 用二进制内置的健康检查端点探活，无需额外装 curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/app/api"]
