// 讓 Android 的 Chrome 願意把這一頁「安裝」成 App。平常什麼都不快取，全部照常連線。
// 唯一的例外：使用者在安裝頁自訂的名稱和圖示（custom.webmanifest、custom-icon-*.png）。
// 這三個檔不在網站上，是存在這支手機裡的，這裡負責在瀏覽器要的時候把它們交出去。
var CUSTOM = "custom-v1";
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  var path = new URL(e.request.url).pathname;
  if (!/\/custom(\.webmanifest|-icon-(192|512)\.png)$/.test(path)) return;
  e.respondWith(caches.open(CUSTOM).then(function (c) {
    return c.match(path.slice(path.lastIndexOf("/") + 1)).then(function (r) { return r || new Response("not found", { status: 404 }); });
  }));
});
