GO ?= go
PNPM ?= pnpm

.PHONY: help bootstrap fmt lint test test-integration build docker-build dev kind-up kind-down deploy demo e2e security

help:
	@echo "KDiag targets: bootstrap fmt lint test test-integration build docker-build dev kind-up kind-down deploy demo e2e security"

bootstrap:
	$(GO) mod download
	$(PNPM) install --frozen-lockfile

fmt:
	$(GO) fmt ./...

lint:
	$(GO) vet ./...
	$(PNPM) --filter kdiag-web lint
	$(PNPM) --filter kdiag-web typecheck

test:
	$(GO) test ./...
	$(PNPM) --filter kdiag-web test --run

test-integration:
	$(GO) test -tags=integration ./internal/repository/...

build:
	$(GO) build -o bin/kdiag-api ./cmd/kdiag-api
	$(GO) build -o bin/kdiag ./cmd/kdiag
	$(PNPM) --filter kdiag-web build

docker-build:
	docker build -f deploy/docker/api.Dockerfile -t kdiag-api:dev .
	docker build -f deploy/docker/web.Dockerfile -t kdiag-web:dev .

dev:
	docker compose up --build

kind-up:
	kind create cluster --name kdiag --config deploy/kind/cluster.yaml

kind-down:
	kind delete cluster --name kdiag

deploy:
	helm upgrade --install kdiag deploy/helm/kdiag --namespace kdiag-system --create-namespace

demo:
	kubectl apply -f deploy/demo/targetport/

e2e:
	./deploy/kind/run-e2e.sh targetport

security:
	govulncheck ./...
	gosec -exclude-generated ./cmd/... ./internal/... ./pkg/...
	gitleaks dir . --config .gitleaks.toml
