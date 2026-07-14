if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("sw.js")
      .then(function (reg) {
        console.log("Service Worker registered:", reg.scope);
      })
      .catch(function (err) {
        console.error("Service Worker registration failed:", err);
      });
  });
}
