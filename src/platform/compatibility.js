export function installCompatibility(root) {
  "use strict";
  function define(object, name, value) {
    if (!(name in object))
      Object.defineProperty(object, name, {
        value: value,
        configurable: true,
        writable: true,
      });
  }
  define(root, "globalThis", root);
  function integer(value) {
    var n = Number(value);
    return n !== n || n === 0 ? 0 : n < 0 ? Math.ceil(n) : Math.floor(n);
  }
  function length(value) {
    return Math.min(Math.max(integer(value), 0), 9007199254740991);
  }
  define(Array.prototype, "at", function (index) {
    if (this == null) throw new TypeError("Array.at");
    var a = Object(this),
      n = length(a.length),
      i = integer(index);
    if (i < 0) i += n;
    return i < 0 || i >= n ? undefined : a[i];
  });
  define(Array.prototype, "findLast", function (fn, ctx) {
    if (this == null || typeof fn !== "function") throw new TypeError("Array.findLast");
    var a = Object(this),
      i = length(a.length);
    while (i--) if (fn.call(ctx, a[i], i, a)) return a[i];
  });
  function flatten(out, a, depth) {
    for (var i = 0, n = length(a.length); i < n; i++)
      if (i in a) {
        var v = a[i];
        if (depth > 0 && Array.isArray(v)) flatten(out, v, depth - 1);
        else out.push(v);
      }
    return out;
  }
  define(Array.prototype, "flat", function (depth) {
    if (this == null) throw new TypeError("Array.flat");
    return flatten([], Object(this), depth === undefined ? 1 : integer(depth));
  });
  define(Array.prototype, "flatMap", function (fn, ctx) {
    if (this == null || typeof fn !== "function") throw new TypeError("Array.flatMap");
    var a = Object(this),
      out = [];
    for (var i = 0, n = length(a.length); i < n; i++)
      if (i in a) {
        var v = fn.call(ctx, a[i], i, a);
        if (Array.isArray(v)) flatten(out, v, 0);
        else out.push(v);
      }
    return out;
  });
  define(Object, "fromEntries", function (entries) {
    var result = {};
    for (var entry of entries) {
      if (entry === null || typeof entry !== "object") throw new TypeError("Object.fromEntries");
      Object.defineProperty(result, entry[0], {
        value: entry[1],
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  });
  if (root.Blob && root.FileReader) {
    function read(blob, mode) {
      return new Promise(function (resolve, reject) {
        var r = new root.FileReader();
        r.onload = function () {
          resolve(r.result);
        };
        r.onerror = function () {
          reject(r.error || new Error("Ошибка чтения файла."));
        };
        r.onabort = function () {
          reject(new Error("Чтение отменено."));
        };
        if (mode === "text") r.readAsText(blob, "UTF-8");
        else r.readAsArrayBuffer(blob);
      });
    }
    define(root.Blob.prototype, "text", function () {
      return read(this, "text");
    });
    define(root.Blob.prototype, "arrayBuffer", function () {
      return read(this, "buffer");
    });
  }
  if (!root.document) return;
  function replaceChildren() {
    while (this.firstChild) this.removeChild(this.firstChild);
    for (var i = 0; i < arguments.length; i++)
      this.appendChild(
        arguments[i] && arguments[i].nodeType
          ? arguments[i]
          : root.document.createTextNode(String(arguments[i])),
      );
  }
  if (root.Element) define(root.Element.prototype, "replaceChildren", replaceChildren);
  if (root.DocumentFragment)
    define(root.DocumentFragment.prototype, "replaceChildren", replaceChildren);
  var stack = [],
    dialogs = root.document.querySelectorAll("dialog");
  for (var i = 0; i < dialogs.length; i++)
    (function (dialog) {
      if (typeof dialog.showModal === "function") return;
      var previous, backdrop;
      Object.defineProperty(dialog, "open", {
        configurable: true,
        get: function () {
          return this.hasAttribute("open");
        },
        set: function (v) {
          if (v) this.setAttribute("open", "");
          else this.removeAttribute("open");
        },
      });
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("tabindex", "-1");
      dialog.classList.add("fallbackDialog");
      dialog.showModal = function () {
        if (dialog.open) return;
        previous = root.document.activeElement;
        backdrop = root.document.createElement("div");
        backdrop.className = "dialogBackdrop";
        root.document.body.appendChild(backdrop);
        dialog.open = true;
        stack.push(dialog);
        var f = dialog.querySelector(
          "[autofocus],button:not([disabled]):not([hidden]),input:not([disabled]),select:not([disabled])",
        );
        (f || dialog).focus();
      };
      dialog.close = function () {
        if (!dialog.open) return;
        dialog.open = false;
        if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        var at = stack.indexOf(dialog);
        if (at >= 0) stack.splice(at, 1);
        if (previous && previous.focus) previous.focus();
        dialog.dispatchEvent(new Event("close"));
      };
    })(dialogs[i]);
  root.document.addEventListener(
    "keydown",
    function (e) {
      var dialog = stack[stack.length - 1];
      if (!dialog) return;
      if (e.key === "Escape" || e.key === "Esc") {
        var cancel = new Event("cancel", { cancelable: true });
        dialog.dispatchEvent(cancel);
        e.preventDefault();
        e.stopPropagation();
        if (!cancel.defaultPrevented) dialog.close();
        return;
      }
      if (e.key !== "Tab") return;
      var all = dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]'),
        items = [];
      for (var j = 0; j < all.length; j++)
        if (!all[j].disabled && all[j].getClientRects().length) items.push(all[j]);
      var first = items[0] || dialog,
        last = items[items.length - 1] || dialog,
        active = root.document.activeElement;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    },
    true,
  );
}
