// 只是為了讓 Android 的 Chrome 願意把這一頁「安裝」成 App；不快取任何東西，全部照常連線。
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function () {});
