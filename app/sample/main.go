// sample-service — alvo de exemplo p/ o relay de planejamento do apifor.dev.
package main

import (
	"fmt"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintln(w, "sample-service")
	})
	http.HandleFunc("/version", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintln(w, "v0.1.0")
	})
	http.ListenAndServe(":8080", nil)
}
