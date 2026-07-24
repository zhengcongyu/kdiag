FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
COPY pkg ./pkg
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/kdiag-api ./cmd/kdiag-api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/kdiag-api /usr/local/bin/kdiag-api
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/kdiag-api"]

