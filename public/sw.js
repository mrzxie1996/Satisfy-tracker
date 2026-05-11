/* eslint-disable no-restricted-globals */
self.addEventListener("push", function (event) {
  var data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    data = { title: "Satisfy 追踪", body: event.data ? event.data.text() : "" };
  }
  var title = data.title || "Satisfy 上新提醒";
  var body = data.body || "";
  var url = data.url || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { url: url },
      tag: "satisfy-new-in",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url =
    event.notification.data && event.notification.data.url ? event.notification.data.url : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      var i;
      for (i = 0; i < clientList.length; i++) {
        var c = clientList[i];
        if (c.url.indexOf(self.registration.scope) !== -1 && "focus" in c) {
          return c.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
      return undefined;
    }),
  );
});
