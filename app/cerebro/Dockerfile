FROM golang:1.22-alpine AS build
WORKDIR /src
COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build -trimpath -o /out/cerebro ./cmd/cerebro

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/cerebro /cerebro
EXPOSE 8080 9090
ENTRYPOINT ["/cerebro"]
