try {
  self["workbox:core:7.4.0"] && _();
} catch {
}
const Q = (s, ...e) => {
  let t = s;
  return e.length > 0 && (t += ` :: ${JSON.stringify(e)}`), t;
}, z = Q;
class l extends Error {
  /**
   *
   * @param {string} errorCode The error code that
   * identifies this particular error.
   * @param {Object=} details Any relevant arguments
   * that will help developers identify issues should
   * be added as a key on the context object.
   */
  constructor(e, t) {
    const n = z(e, t);
    super(n), this.name = e, this.details = t;
  }
}
const d = {
  googleAnalytics: "googleAnalytics",
  precache: "precache-v2",
  prefix: "workbox",
  runtime: "runtime",
  suffix: typeof registration < "u" ? registration.scope : ""
}, E = (s) => [d.prefix, s, d.suffix].filter((e) => e && e.length > 0).join("-"), J = (s) => {
  for (const e of Object.keys(d))
    s(e);
}, b = {
  updateDetails: (s) => {
    J((e) => {
      typeof s[e] == "string" && (d[e] = s[e]);
    });
  },
  getGoogleAnalyticsName: (s) => s || E(d.googleAnalytics),
  getPrecacheName: (s) => s || E(d.precache),
  getPrefix: () => d.prefix,
  getRuntimeName: (s) => s || E(d.runtime),
  getSuffix: () => d.suffix
};
function K(s, e) {
  const t = e();
  return s.waitUntil(t), t;
}
try {
  self["workbox:precaching:7.4.0"] && _();
} catch {
}
const X = "__WB_REVISION__";
function Y(s) {
  if (!s)
    throw new l("add-to-cache-list-unexpected-type", { entry: s });
  if (typeof s == "string") {
    const i = new URL(s, location.href);
    return {
      cacheKey: i.href,
      url: i.href
    };
  }
  const { revision: e, url: t } = s;
  if (!t)
    throw new l("add-to-cache-list-unexpected-type", { entry: s });
  if (!e) {
    const i = new URL(t, location.href);
    return {
      cacheKey: i.href,
      url: i.href
    };
  }
  const n = new URL(t, location.href), a = new URL(t, location.href);
  return n.searchParams.set(X, e), {
    cacheKey: n.href,
    url: a.href
  };
}
class Z {
  constructor() {
    this.updatedURLs = [], this.notUpdatedURLs = [], this.handlerWillStart = async ({ request: e, state: t }) => {
      t && (t.originalRequest = e);
    }, this.cachedResponseWillBeUsed = async ({ event: e, state: t, cachedResponse: n }) => {
      if (e.type === "install" && t && t.originalRequest && t.originalRequest instanceof Request) {
        const a = t.originalRequest.url;
        n ? this.notUpdatedURLs.push(a) : this.updatedURLs.push(a);
      }
      return n;
    };
  }
}
class ee {
  constructor({ precacheController: e }) {
    this.cacheKeyWillBeUsed = async ({ request: t, params: n }) => {
      const a = (n == null ? void 0 : n.cacheKey) || this._precacheController.getCacheKeyForURL(t.url);
      return a ? new Request(a, { headers: t.headers }) : t;
    }, this._precacheController = e;
  }
}
let m;
function te() {
  if (m === void 0) {
    const s = new Response("");
    if ("body" in s)
      try {
        new Response(s.body), m = !0;
      } catch {
        m = !1;
      }
    m = !1;
  }
  return m;
}
async function se(s, e) {
  let t = null;
  if (s.url && (t = new URL(s.url).origin), t !== self.location.origin)
    throw new l("cross-origin-copy-response", { origin: t });
  const n = s.clone(), i = {
    headers: new Headers(n.headers),
    status: n.status,
    statusText: n.statusText
  }, r = te() ? n.body : await n.blob();
  return new Response(r, i);
}
const ne = (s) => new URL(String(s), location.href).href.replace(new RegExp(`^${location.origin}`), "");
function S(s, e) {
  const t = new URL(s);
  for (const n of e)
    t.searchParams.delete(n);
  return t.href;
}
async function ae(s, e, t, n) {
  const a = S(e.url, t);
  if (e.url === a)
    return s.match(e, n);
  const i = Object.assign(Object.assign({}, n), { ignoreSearch: !0 }), r = await s.keys(e, i);
  for (const c of r) {
    const o = S(c.url, t);
    if (a === o)
      return s.match(c, n);
  }
}
class ie {
  /**
   * Creates a promise and exposes its resolve and reject functions as methods.
   */
  constructor() {
    this.promise = new Promise((e, t) => {
      this.resolve = e, this.reject = t;
    });
  }
}
const j = /* @__PURE__ */ new Set();
async function re() {
  for (const s of j)
    await s();
}
function ce(s) {
  return new Promise((e) => setTimeout(e, s));
}
try {
  self["workbox:strategies:7.4.0"] && _();
} catch {
}
function C(s) {
  return typeof s == "string" ? new Request(s) : s;
}
class oe {
  /**
   * Creates a new instance associated with the passed strategy and event
   * that's handling the request.
   *
   * The constructor also initializes the state that will be passed to each of
   * the plugins handling this request.
   *
   * @param {workbox-strategies.Strategy} strategy
   * @param {Object} options
   * @param {Request|string} options.request A request to run this strategy for.
   * @param {ExtendableEvent} options.event The event associated with the
   *     request.
   * @param {URL} [options.url]
   * @param {*} [options.params] The return value from the
   *     {@link workbox-routing~matchCallback} (if applicable).
   */
  constructor(e, t) {
    this._cacheKeys = {}, Object.assign(this, t), this.event = t.event, this._strategy = e, this._handlerDeferred = new ie(), this._extendLifetimePromises = [], this._plugins = [...e.plugins], this._pluginStateMap = /* @__PURE__ */ new Map();
    for (const n of this._plugins)
      this._pluginStateMap.set(n, {});
    this.event.waitUntil(this._handlerDeferred.promise);
  }
  /**
   * Fetches a given request (and invokes any applicable plugin callback
   * methods) using the `fetchOptions` (for non-navigation requests) and
   * `plugins` defined on the `Strategy` object.
   *
   * The following plugin lifecycle methods are invoked when using this method:
   * - `requestWillFetch()`
   * - `fetchDidSucceed()`
   * - `fetchDidFail()`
   *
   * @param {Request|string} input The URL or request to fetch.
   * @return {Promise<Response>}
   */
  async fetch(e) {
    const { event: t } = this;
    let n = C(e);
    if (n.mode === "navigate" && t instanceof FetchEvent && t.preloadResponse) {
      const r = await t.preloadResponse;
      if (r)
        return r;
    }
    const a = this.hasCallback("fetchDidFail") ? n.clone() : null;
    try {
      for (const r of this.iterateCallbacks("requestWillFetch"))
        n = await r({ request: n.clone(), event: t });
    } catch (r) {
      if (r instanceof Error)
        throw new l("plugin-error-request-will-fetch", {
          thrownErrorMessage: r.message
        });
    }
    const i = n.clone();
    try {
      let r;
      r = await fetch(n, n.mode === "navigate" ? void 0 : this._strategy.fetchOptions);
      for (const c of this.iterateCallbacks("fetchDidSucceed"))
        r = await c({
          event: t,
          request: i,
          response: r
        });
      return r;
    } catch (r) {
      throw a && await this.runCallbacks("fetchDidFail", {
        error: r,
        event: t,
        originalRequest: a.clone(),
        request: i.clone()
      }), r;
    }
  }
  /**
   * Calls `this.fetch()` and (in the background) runs `this.cachePut()` on
   * the response generated by `this.fetch()`.
   *
   * The call to `this.cachePut()` automatically invokes `this.waitUntil()`,
   * so you do not have to manually call `waitUntil()` on the event.
   *
   * @param {Request|string} input The request or URL to fetch and cache.
   * @return {Promise<Response>}
   */
  async fetchAndCachePut(e) {
    const t = await this.fetch(e), n = t.clone();
    return this.waitUntil(this.cachePut(e, n)), t;
  }
  /**
   * Matches a request from the cache (and invokes any applicable plugin
   * callback methods) using the `cacheName`, `matchOptions`, and `plugins`
   * defined on the strategy object.
   *
   * The following plugin lifecycle methods are invoked when using this method:
   * - cacheKeyWillBeUsed()
   * - cachedResponseWillBeUsed()
   *
   * @param {Request|string} key The Request or URL to use as the cache key.
   * @return {Promise<Response|undefined>} A matching response, if found.
   */
  async cacheMatch(e) {
    const t = C(e);
    let n;
    const { cacheName: a, matchOptions: i } = this._strategy, r = await this.getCacheKey(t, "read"), c = Object.assign(Object.assign({}, i), { cacheName: a });
    n = await caches.match(r, c);
    for (const o of this.iterateCallbacks("cachedResponseWillBeUsed"))
      n = await o({
        cacheName: a,
        matchOptions: i,
        cachedResponse: n,
        request: r,
        event: this.event
      }) || void 0;
    return n;
  }
  /**
   * Puts a request/response pair in the cache (and invokes any applicable
   * plugin callback methods) using the `cacheName` and `plugins` defined on
   * the strategy object.
   *
   * The following plugin lifecycle methods are invoked when using this method:
   * - cacheKeyWillBeUsed()
   * - cacheWillUpdate()
   * - cacheDidUpdate()
   *
   * @param {Request|string} key The request or URL to use as the cache key.
   * @param {Response} response The response to cache.
   * @return {Promise<boolean>} `false` if a cacheWillUpdate caused the response
   * not be cached, and `true` otherwise.
   */
  async cachePut(e, t) {
    const n = C(e);
    await ce(0);
    const a = await this.getCacheKey(n, "write");
    if (!t)
      throw new l("cache-put-with-no-response", {
        url: ne(a.url)
      });
    const i = await this._ensureResponseSafeToCache(t);
    if (!i)
      return !1;
    const { cacheName: r, matchOptions: c } = this._strategy, o = await self.caches.open(r), h = this.hasCallback("cacheDidUpdate"), g = h ? await ae(
      // TODO(philipwalton): the `__WB_REVISION__` param is a precaching
      // feature. Consider into ways to only add this behavior if using
      // precaching.
      o,
      a.clone(),
      ["__WB_REVISION__"],
      c
    ) : null;
    try {
      await o.put(a, h ? i.clone() : i);
    } catch (u) {
      if (u instanceof Error)
        throw u.name === "QuotaExceededError" && await re(), u;
    }
    for (const u of this.iterateCallbacks("cacheDidUpdate"))
      await u({
        cacheName: r,
        oldResponse: g,
        newResponse: i.clone(),
        request: a,
        event: this.event
      });
    return !0;
  }
  /**
   * Checks the list of plugins for the `cacheKeyWillBeUsed` callback, and
   * executes any of those callbacks found in sequence. The final `Request`
   * object returned by the last plugin is treated as the cache key for cache
   * reads and/or writes. If no `cacheKeyWillBeUsed` plugin callbacks have
   * been registered, the passed request is returned unmodified
   *
   * @param {Request} request
   * @param {string} mode
   * @return {Promise<Request>}
   */
  async getCacheKey(e, t) {
    const n = `${e.url} | ${t}`;
    if (!this._cacheKeys[n]) {
      let a = e;
      for (const i of this.iterateCallbacks("cacheKeyWillBeUsed"))
        a = C(await i({
          mode: t,
          request: a,
          event: this.event,
          // params has a type any can't change right now.
          params: this.params
          // eslint-disable-line
        }));
      this._cacheKeys[n] = a;
    }
    return this._cacheKeys[n];
  }
  /**
   * Returns true if the strategy has at least one plugin with the given
   * callback.
   *
   * @param {string} name The name of the callback to check for.
   * @return {boolean}
   */
  hasCallback(e) {
    for (const t of this._strategy.plugins)
      if (e in t)
        return !0;
    return !1;
  }
  /**
   * Runs all plugin callbacks matching the given name, in order, passing the
   * given param object (merged ith the current plugin state) as the only
   * argument.
   *
   * Note: since this method runs all plugins, it's not suitable for cases
   * where the return value of a callback needs to be applied prior to calling
   * the next callback. See
   * {@link workbox-strategies.StrategyHandler#iterateCallbacks}
   * below for how to handle that case.
   *
   * @param {string} name The name of the callback to run within each plugin.
   * @param {Object} param The object to pass as the first (and only) param
   *     when executing each callback. This object will be merged with the
   *     current plugin state prior to callback execution.
   */
  async runCallbacks(e, t) {
    for (const n of this.iterateCallbacks(e))
      await n(t);
  }
  /**
   * Accepts a callback and returns an iterable of matching plugin callbacks,
   * where each callback is wrapped with the current handler state (i.e. when
   * you call each callback, whatever object parameter you pass it will
   * be merged with the plugin's current state).
   *
   * @param {string} name The name fo the callback to run
   * @return {Array<Function>}
   */
  *iterateCallbacks(e) {
    for (const t of this._strategy.plugins)
      if (typeof t[e] == "function") {
        const n = this._pluginStateMap.get(t);
        yield (i) => {
          const r = Object.assign(Object.assign({}, i), { state: n });
          return t[e](r);
        };
      }
  }
  /**
   * Adds a promise to the
   * [extend lifetime promises]{@link https://w3c.github.io/ServiceWorker/#extendableevent-extend-lifetime-promises}
   * of the event associated with the request being handled (usually a
   * `FetchEvent`).
   *
   * Note: you can await
   * {@link workbox-strategies.StrategyHandler~doneWaiting}
   * to know when all added promises have settled.
   *
   * @param {Promise} promise A promise to add to the extend lifetime promises
   *     of the event that triggered the request.
   */
  waitUntil(e) {
    return this._extendLifetimePromises.push(e), e;
  }
  /**
   * Returns a promise that resolves once all promises passed to
   * {@link workbox-strategies.StrategyHandler~waitUntil}
   * have settled.
   *
   * Note: any work done after `doneWaiting()` settles should be manually
   * passed to an event's `waitUntil()` method (not this handler's
   * `waitUntil()` method), otherwise the service worker thread may be killed
   * prior to your work completing.
   */
  async doneWaiting() {
    for (; this._extendLifetimePromises.length; ) {
      const e = this._extendLifetimePromises.splice(0), n = (await Promise.allSettled(e)).find((a) => a.status === "rejected");
      if (n)
        throw n.reason;
    }
  }
  /**
   * Stops running the strategy and immediately resolves any pending
   * `waitUntil()` promises.
   */
  destroy() {
    this._handlerDeferred.resolve(null);
  }
  /**
   * This method will call cacheWillUpdate on the available plugins (or use
   * status === 200) to determine if the Response is safe and valid to cache.
   *
   * @param {Request} options.request
   * @param {Response} options.response
   * @return {Promise<Response|undefined>}
   *
   * @private
   */
  async _ensureResponseSafeToCache(e) {
    let t = e, n = !1;
    for (const a of this.iterateCallbacks("cacheWillUpdate"))
      if (t = await a({
        request: this.request,
        response: t,
        event: this.event
      }) || void 0, n = !0, !t)
        break;
    return n || t && t.status !== 200 && (t = void 0), t;
  }
}
class N {
  /**
   * Creates a new instance of the strategy and sets all documented option
   * properties as public instance properties.
   *
   * Note: if a custom strategy class extends the base Strategy class and does
   * not need more than these properties, it does not need to define its own
   * constructor.
   *
   * @param {Object} [options]
   * @param {string} [options.cacheName] Cache name to store and retrieve
   * requests. Defaults to the cache names provided by
   * {@link workbox-core.cacheNames}.
   * @param {Array<Object>} [options.plugins] [Plugins]{@link https://developers.google.com/web/tools/workbox/guides/using-plugins}
   * to use in conjunction with this caching strategy.
   * @param {Object} [options.fetchOptions] Values passed along to the
   * [`init`](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch#Parameters)
   * of [non-navigation](https://github.com/GoogleChrome/workbox/issues/1796)
   * `fetch()` requests made by this strategy.
   * @param {Object} [options.matchOptions] The
   * [`CacheQueryOptions`]{@link https://w3c.github.io/ServiceWorker/#dictdef-cachequeryoptions}
   * for any `cache.match()` or `cache.put()` calls made by this strategy.
   */
  constructor(e = {}) {
    this.cacheName = b.getRuntimeName(e.cacheName), this.plugins = e.plugins || [], this.fetchOptions = e.fetchOptions, this.matchOptions = e.matchOptions;
  }
  /**
   * Perform a request strategy and returns a `Promise` that will resolve with
   * a `Response`, invoking all relevant plugin callbacks.
   *
   * When a strategy instance is registered with a Workbox
   * {@link workbox-routing.Route}, this method is automatically
   * called when the route matches.
   *
   * Alternatively, this method can be used in a standalone `FetchEvent`
   * listener by passing it to `event.respondWith()`.
   *
   * @param {FetchEvent|Object} options A `FetchEvent` or an object with the
   *     properties listed below.
   * @param {Request|string} options.request A request to run this strategy for.
   * @param {ExtendableEvent} options.event The event associated with the
   *     request.
   * @param {URL} [options.url]
   * @param {*} [options.params]
   */
  handle(e) {
    const [t] = this.handleAll(e);
    return t;
  }
  /**
   * Similar to {@link workbox-strategies.Strategy~handle}, but
   * instead of just returning a `Promise` that resolves to a `Response` it
   * it will return an tuple of `[response, done]` promises, where the former
   * (`response`) is equivalent to what `handle()` returns, and the latter is a
   * Promise that will resolve once any promises that were added to
   * `event.waitUntil()` as part of performing the strategy have completed.
   *
   * You can await the `done` promise to ensure any extra work performed by
   * the strategy (usually caching responses) completes successfully.
   *
   * @param {FetchEvent|Object} options A `FetchEvent` or an object with the
   *     properties listed below.
   * @param {Request|string} options.request A request to run this strategy for.
   * @param {ExtendableEvent} options.event The event associated with the
   *     request.
   * @param {URL} [options.url]
   * @param {*} [options.params]
   * @return {Array<Promise>} A tuple of [response, done]
   *     promises that can be used to determine when the response resolves as
   *     well as when the handler has completed all its work.
   */
  handleAll(e) {
    e instanceof FetchEvent && (e = {
      event: e,
      request: e.request
    });
    const t = e.event, n = typeof e.request == "string" ? new Request(e.request) : e.request, a = "params" in e ? e.params : void 0, i = new oe(this, { event: t, request: n, params: a }), r = this._getResponse(i, n, t), c = this._awaitComplete(r, i, n, t);
    return [r, c];
  }
  async _getResponse(e, t, n) {
    await e.runCallbacks("handlerWillStart", { event: n, request: t });
    let a;
    try {
      if (a = await this._handle(t, e), !a || a.type === "error")
        throw new l("no-response", { url: t.url });
    } catch (i) {
      if (i instanceof Error) {
        for (const r of e.iterateCallbacks("handlerDidError"))
          if (a = await r({ error: i, event: n, request: t }), a)
            break;
      }
      if (!a)
        throw i;
    }
    for (const i of e.iterateCallbacks("handlerWillRespond"))
      a = await i({ event: n, request: t, response: a });
    return a;
  }
  async _awaitComplete(e, t, n, a) {
    let i, r;
    try {
      i = await e;
    } catch {
    }
    try {
      await t.runCallbacks("handlerDidRespond", {
        event: a,
        request: n,
        response: i
      }), await t.doneWaiting();
    } catch (c) {
      c instanceof Error && (r = c);
    }
    if (await t.runCallbacks("handlerDidComplete", {
      event: a,
      request: n,
      response: i,
      error: r
    }), t.destroy(), r)
      throw r;
  }
}
class p extends N {
  /**
   *
   * @param {Object} [options]
   * @param {string} [options.cacheName] Cache name to store and retrieve
   * requests. Defaults to the cache names provided by
   * {@link workbox-core.cacheNames}.
   * @param {Array<Object>} [options.plugins] {@link https://developers.google.com/web/tools/workbox/guides/using-plugins|Plugins}
   * to use in conjunction with this caching strategy.
   * @param {Object} [options.fetchOptions] Values passed along to the
   * {@link https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch#Parameters|init}
   * of all fetch() requests made by this strategy.
   * @param {Object} [options.matchOptions] The
   * {@link https://w3c.github.io/ServiceWorker/#dictdef-cachequeryoptions|CacheQueryOptions}
   * for any `cache.match()` or `cache.put()` calls made by this strategy.
   * @param {boolean} [options.fallbackToNetwork=true] Whether to attempt to
   * get the response from the network if there's a precache miss.
   */
  constructor(e = {}) {
    e.cacheName = b.getPrecacheName(e.cacheName), super(e), this._fallbackToNetwork = e.fallbackToNetwork !== !1, this.plugins.push(p.copyRedirectedCacheableResponsesPlugin);
  }
  /**
   * @private
   * @param {Request|string} request A request to run this strategy for.
   * @param {workbox-strategies.StrategyHandler} handler The event that
   *     triggered the request.
   * @return {Promise<Response>}
   */
  async _handle(e, t) {
    const n = await t.cacheMatch(e);
    return n || (t.event && t.event.type === "install" ? await this._handleInstall(e, t) : await this._handleFetch(e, t));
  }
  async _handleFetch(e, t) {
    let n;
    const a = t.params || {};
    if (this._fallbackToNetwork) {
      const i = a.integrity, r = e.integrity, c = !r || r === i;
      n = await t.fetch(new Request(e, {
        integrity: e.mode !== "no-cors" ? r || i : void 0
      })), i && c && e.mode !== "no-cors" && (this._useDefaultCacheabilityPluginIfNeeded(), await t.cachePut(e, n.clone()));
    } else
      throw new l("missing-precache-entry", {
        cacheName: this.cacheName,
        url: e.url
      });
    return n;
  }
  async _handleInstall(e, t) {
    this._useDefaultCacheabilityPluginIfNeeded();
    const n = await t.fetch(e);
    if (!await t.cachePut(e, n.clone()))
      throw new l("bad-precaching-response", {
        url: e.url,
        status: n.status
      });
    return n;
  }
  /**
   * This method is complex, as there a number of things to account for:
   *
   * The `plugins` array can be set at construction, and/or it might be added to
   * to at any time before the strategy is used.
   *
   * At the time the strategy is used (i.e. during an `install` event), there
   * needs to be at least one plugin that implements `cacheWillUpdate` in the
   * array, other than `copyRedirectedCacheableResponsesPlugin`.
   *
   * - If this method is called and there are no suitable `cacheWillUpdate`
   * plugins, we need to add `defaultPrecacheCacheabilityPlugin`.
   *
   * - If this method is called and there is exactly one `cacheWillUpdate`, then
   * we don't have to do anything (this might be a previously added
   * `defaultPrecacheCacheabilityPlugin`, or it might be a custom plugin).
   *
   * - If this method is called and there is more than one `cacheWillUpdate`,
   * then we need to check if one is `defaultPrecacheCacheabilityPlugin`. If so,
   * we need to remove it. (This situation is unlikely, but it could happen if
   * the strategy is used multiple times, the first without a `cacheWillUpdate`,
   * and then later on after manually adding a custom `cacheWillUpdate`.)
   *
   * See https://github.com/GoogleChrome/workbox/issues/2737 for more context.
   *
   * @private
   */
  _useDefaultCacheabilityPluginIfNeeded() {
    let e = null, t = 0;
    for (const [n, a] of this.plugins.entries())
      a !== p.copyRedirectedCacheableResponsesPlugin && (a === p.defaultPrecacheCacheabilityPlugin && (e = n), a.cacheWillUpdate && t++);
    t === 0 ? this.plugins.push(p.defaultPrecacheCacheabilityPlugin) : t > 1 && e !== null && this.plugins.splice(e, 1);
  }
}
p.defaultPrecacheCacheabilityPlugin = {
  async cacheWillUpdate({ response: s }) {
    return !s || s.status >= 400 ? null : s;
  }
};
p.copyRedirectedCacheableResponsesPlugin = {
  async cacheWillUpdate({ response: s }) {
    return s.redirected ? await se(s) : s;
  }
};
class he {
  /**
   * Create a new PrecacheController.
   *
   * @param {Object} [options]
   * @param {string} [options.cacheName] The cache to use for precaching.
   * @param {string} [options.plugins] Plugins to use when precaching as well
   * as responding to fetch events for precached assets.
   * @param {boolean} [options.fallbackToNetwork=true] Whether to attempt to
   * get the response from the network if there's a precache miss.
   */
  constructor({ cacheName: e, plugins: t = [], fallbackToNetwork: n = !0 } = {}) {
    this._urlsToCacheKeys = /* @__PURE__ */ new Map(), this._urlsToCacheModes = /* @__PURE__ */ new Map(), this._cacheKeysToIntegrities = /* @__PURE__ */ new Map(), this._strategy = new p({
      cacheName: b.getPrecacheName(e),
      plugins: [
        ...t,
        new ee({ precacheController: this })
      ],
      fallbackToNetwork: n
    }), this.install = this.install.bind(this), this.activate = this.activate.bind(this);
  }
  /**
   * @type {workbox-precaching.PrecacheStrategy} The strategy created by this controller and
   * used to cache assets and respond to fetch events.
   */
  get strategy() {
    return this._strategy;
  }
  /**
   * Adds items to the precache list, removing any duplicates and
   * stores the files in the
   * {@link workbox-core.cacheNames|"precache cache"} when the service
   * worker installs.
   *
   * This method can be called multiple times.
   *
   * @param {Array<Object|string>} [entries=[]] Array of entries to precache.
   */
  precache(e) {
    this.addToCacheList(e), this._installAndActiveListenersAdded || (self.addEventListener("install", this.install), self.addEventListener("activate", this.activate), this._installAndActiveListenersAdded = !0);
  }
  /**
   * This method will add items to the precache list, removing duplicates
   * and ensuring the information is valid.
   *
   * @param {Array<workbox-precaching.PrecacheController.PrecacheEntry|string>} entries
   *     Array of entries to precache.
   */
  addToCacheList(e) {
    const t = [];
    for (const n of e) {
      typeof n == "string" ? t.push(n) : n && n.revision === void 0 && t.push(n.url);
      const { cacheKey: a, url: i } = Y(n), r = typeof n != "string" && n.revision ? "reload" : "default";
      if (this._urlsToCacheKeys.has(i) && this._urlsToCacheKeys.get(i) !== a)
        throw new l("add-to-cache-list-conflicting-entries", {
          firstEntry: this._urlsToCacheKeys.get(i),
          secondEntry: a
        });
      if (typeof n != "string" && n.integrity) {
        if (this._cacheKeysToIntegrities.has(a) && this._cacheKeysToIntegrities.get(a) !== n.integrity)
          throw new l("add-to-cache-list-conflicting-integrities", {
            url: i
          });
        this._cacheKeysToIntegrities.set(a, n.integrity);
      }
      if (this._urlsToCacheKeys.set(i, a), this._urlsToCacheModes.set(i, r), t.length > 0) {
        const c = `Workbox is precaching URLs without revision info: ${t.join(", ")}
This is generally NOT safe. Learn more at https://bit.ly/wb-precache`;
        console.warn(c);
      }
    }
  }
  /**
   * Precaches new and updated assets. Call this method from the service worker
   * install event.
   *
   * Note: this method calls `event.waitUntil()` for you, so you do not need
   * to call it yourself in your event handlers.
   *
   * @param {ExtendableEvent} event
   * @return {Promise<workbox-precaching.InstallResult>}
   */
  install(e) {
    return K(e, async () => {
      const t = new Z();
      this.strategy.plugins.push(t);
      for (const [i, r] of this._urlsToCacheKeys) {
        const c = this._cacheKeysToIntegrities.get(r), o = this._urlsToCacheModes.get(i), h = new Request(i, {
          integrity: c,
          cache: o,
          credentials: "same-origin"
        });
        await Promise.all(this.strategy.handleAll({
          params: { cacheKey: r },
          request: h,
          event: e
        }));
      }
      const { updatedURLs: n, notUpdatedURLs: a } = t;
      return { updatedURLs: n, notUpdatedURLs: a };
    });
  }
  /**
   * Deletes assets that are no longer present in the current precache manifest.
   * Call this method from the service worker activate event.
   *
   * Note: this method calls `event.waitUntil()` for you, so you do not need
   * to call it yourself in your event handlers.
   *
   * @param {ExtendableEvent} event
   * @return {Promise<workbox-precaching.CleanupResult>}
   */
  activate(e) {
    return K(e, async () => {
      const t = await self.caches.open(this.strategy.cacheName), n = await t.keys(), a = new Set(this._urlsToCacheKeys.values()), i = [];
      for (const r of n)
        a.has(r.url) || (await t.delete(r), i.push(r.url));
      return { deletedURLs: i };
    });
  }
  /**
   * Returns a mapping of a precached URL to the corresponding cache key, taking
   * into account the revision information for the URL.
   *
   * @return {Map<string, string>} A URL to cache key mapping.
   */
  getURLsToCacheKeys() {
    return this._urlsToCacheKeys;
  }
  /**
   * Returns a list of all the URLs that have been precached by the current
   * service worker.
   *
   * @return {Array<string>} The precached URLs.
   */
  getCachedURLs() {
    return [...this._urlsToCacheKeys.keys()];
  }
  /**
   * Returns the cache key used for storing a given URL. If that URL is
   * unversioned, like `/index.html', then the cache key will be the original
   * URL with a search parameter appended to it.
   *
   * @param {string} url A URL whose cache key you want to look up.
   * @return {string} The versioned URL that corresponds to a cache key
   * for the original URL, or undefined if that URL isn't precached.
   */
  getCacheKeyForURL(e) {
    const t = new URL(e, location.href);
    return this._urlsToCacheKeys.get(t.href);
  }
  /**
   * @param {string} url A cache key whose SRI you want to look up.
   * @return {string} The subresource integrity associated with the cache key,
   * or undefined if it's not set.
   */
  getIntegrityForCacheKey(e) {
    return this._cacheKeysToIntegrities.get(e);
  }
  /**
   * This acts as a drop-in replacement for
   * [`cache.match()`](https://developer.mozilla.org/en-US/docs/Web/API/Cache/match)
   * with the following differences:
   *
   * - It knows what the name of the precache is, and only checks in that cache.
   * - It allows you to pass in an "original" URL without versioning parameters,
   * and it will automatically look up the correct cache key for the currently
   * active revision of that URL.
   *
   * E.g., `matchPrecache('index.html')` will find the correct precached
   * response for the currently active service worker, even if the actual cache
   * key is `'/index.html?__WB_REVISION__=1234abcd'`.
   *
   * @param {string|Request} request The key (without revisioning parameters)
   * to look up in the precache.
   * @return {Promise<Response|undefined>}
   */
  async matchPrecache(e) {
    const t = e instanceof Request ? e.url : e, n = this.getCacheKeyForURL(t);
    if (n)
      return (await self.caches.open(this.strategy.cacheName)).match(n);
  }
  /**
   * Returns a function that looks up `url` in the precache (taking into
   * account revision information), and returns the corresponding `Response`.
   *
   * @param {string} url The precached URL which will be used to lookup the
   * `Response`.
   * @return {workbox-routing~handlerCallback}
   */
  createHandlerBoundToURL(e) {
    const t = this.getCacheKeyForURL(e);
    if (!t)
      throw new l("non-precached-url", { url: e });
    return (n) => (n.request = new Request(e), n.params = Object.assign({ cacheKey: t }, n.params), this.strategy.handle(n));
  }
}
let D;
const F = () => (D || (D = new he()), D);
try {
  self["workbox:routing:7.4.0"] && _();
} catch {
}
const H = "GET", x = (s) => s && typeof s == "object" ? s : { handle: s };
class R {
  /**
   * Constructor for Route class.
   *
   * @param {workbox-routing~matchCallback} match
   * A callback function that determines whether the route matches a given
   * `fetch` event by returning a non-falsy value.
   * @param {workbox-routing~handlerCallback} handler A callback
   * function that returns a Promise resolving to a Response.
   * @param {string} [method='GET'] The HTTP method to match the Route
   * against.
   */
  constructor(e, t, n = H) {
    this.handler = x(t), this.match = e, this.method = n;
  }
  /**
   *
   * @param {workbox-routing-handlerCallback} handler A callback
   * function that returns a Promise resolving to a Response
   */
  setCatchHandler(e) {
    this.catchHandler = x(e);
  }
}
class le extends R {
  /**
   * If the regular expression contains
   * [capture groups]{@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp#grouping-back-references},
   * the captured values will be passed to the
   * {@link workbox-routing~handlerCallback} `params`
   * argument.
   *
   * @param {RegExp} regExp The regular expression to match against URLs.
   * @param {workbox-routing~handlerCallback} handler A callback
   * function that returns a Promise resulting in a Response.
   * @param {string} [method='GET'] The HTTP method to match the Route
   * against.
   */
  constructor(e, t, n) {
    const a = ({ url: i }) => {
      const r = e.exec(i.href);
      if (r && !(i.origin !== location.origin && r.index !== 0))
        return r.slice(1);
    };
    super(a, t, n);
  }
}
class ue {
  /**
   * Initializes a new Router.
   */
  constructor() {
    this._routes = /* @__PURE__ */ new Map(), this._defaultHandlerMap = /* @__PURE__ */ new Map();
  }
  /**
   * @return {Map<string, Array<workbox-routing.Route>>} routes A `Map` of HTTP
   * method name ('GET', etc.) to an array of all the corresponding `Route`
   * instances that are registered.
   */
  get routes() {
    return this._routes;
  }
  /**
   * Adds a fetch event listener to respond to events when a route matches
   * the event's request.
   */
  addFetchListener() {
    self.addEventListener("fetch", (e) => {
      const { request: t } = e, n = this.handleRequest({ request: t, event: e });
      n && e.respondWith(n);
    });
  }
  /**
   * Adds a message event listener for URLs to cache from the window.
   * This is useful to cache resources loaded on the page prior to when the
   * service worker started controlling it.
   *
   * The format of the message data sent from the window should be as follows.
   * Where the `urlsToCache` array may consist of URL strings or an array of
   * URL string + `requestInit` object (the same as you'd pass to `fetch()`).
   *
   * ```
   * {
   *   type: 'CACHE_URLS',
   *   payload: {
   *     urlsToCache: [
   *       './script1.js',
   *       './script2.js',
   *       ['./script3.js', {mode: 'no-cors'}],
   *     ],
   *   },
   * }
   * ```
   */
  addCacheListener() {
    self.addEventListener("message", (e) => {
      if (e.data && e.data.type === "CACHE_URLS") {
        const { payload: t } = e.data, n = Promise.all(t.urlsToCache.map((a) => {
          typeof a == "string" && (a = [a]);
          const i = new Request(...a);
          return this.handleRequest({ request: i, event: e });
        }));
        e.waitUntil(n), e.ports && e.ports[0] && n.then(() => e.ports[0].postMessage(!0));
      }
    });
  }
  /**
   * Apply the routing rules to a FetchEvent object to get a Response from an
   * appropriate Route's handler.
   *
   * @param {Object} options
   * @param {Request} options.request The request to handle.
   * @param {ExtendableEvent} options.event The event that triggered the
   *     request.
   * @return {Promise<Response>|undefined} A promise is returned if a
   *     registered route can handle the request. If there is no matching
   *     route and there's no `defaultHandler`, `undefined` is returned.
   */
  handleRequest({ request: e, event: t }) {
    const n = new URL(e.url, location.href);
    if (!n.protocol.startsWith("http"))
      return;
    const a = n.origin === location.origin, { params: i, route: r } = this.findMatchingRoute({
      event: t,
      request: e,
      sameOrigin: a,
      url: n
    });
    let c = r && r.handler;
    const o = e.method;
    if (!c && this._defaultHandlerMap.has(o) && (c = this._defaultHandlerMap.get(o)), !c)
      return;
    let h;
    try {
      h = c.handle({ url: n, request: e, event: t, params: i });
    } catch (u) {
      h = Promise.reject(u);
    }
    const g = r && r.catchHandler;
    return h instanceof Promise && (this._catchHandler || g) && (h = h.catch(async (u) => {
      if (g)
        try {
          return await g.handle({ url: n, request: e, event: t, params: i });
        } catch (v) {
          v instanceof Error && (u = v);
        }
      if (this._catchHandler)
        return this._catchHandler.handle({ url: n, request: e, event: t });
      throw u;
    })), h;
  }
  /**
   * Checks a request and URL (and optionally an event) against the list of
   * registered routes, and if there's a match, returns the corresponding
   * route along with any params generated by the match.
   *
   * @param {Object} options
   * @param {URL} options.url
   * @param {boolean} options.sameOrigin The result of comparing `url.origin`
   *     against the current origin.
   * @param {Request} options.request The request to match.
   * @param {Event} options.event The corresponding event.
   * @return {Object} An object with `route` and `params` properties.
   *     They are populated if a matching route was found or `undefined`
   *     otherwise.
   */
  findMatchingRoute({ url: e, sameOrigin: t, request: n, event: a }) {
    const i = this._routes.get(n.method) || [];
    for (const r of i) {
      let c;
      const o = r.match({ url: e, sameOrigin: t, request: n, event: a });
      if (o)
        return c = o, (Array.isArray(c) && c.length === 0 || o.constructor === Object && // eslint-disable-line
        Object.keys(o).length === 0 || typeof o == "boolean") && (c = void 0), { route: r, params: c };
    }
    return {};
  }
  /**
   * Define a default `handler` that's called when no routes explicitly
   * match the incoming request.
   *
   * Each HTTP method ('GET', 'POST', etc.) gets its own default handler.
   *
   * Without a default handler, unmatched requests will go against the
   * network as if there were no service worker present.
   *
   * @param {workbox-routing~handlerCallback} handler A callback
   * function that returns a Promise resulting in a Response.
   * @param {string} [method='GET'] The HTTP method to associate with this
   * default handler. Each method has its own default.
   */
  setDefaultHandler(e, t = H) {
    this._defaultHandlerMap.set(t, x(e));
  }
  /**
   * If a Route throws an error while handling a request, this `handler`
   * will be called and given a chance to provide a response.
   *
   * @param {workbox-routing~handlerCallback} handler A callback
   * function that returns a Promise resulting in a Response.
   */
  setCatchHandler(e) {
    this._catchHandler = x(e);
  }
  /**
   * Registers a route with the router.
   *
   * @param {workbox-routing.Route} route The route to register.
   */
  registerRoute(e) {
    this._routes.has(e.method) || this._routes.set(e.method, []), this._routes.get(e.method).push(e);
  }
  /**
   * Unregisters a route with the router.
   *
   * @param {workbox-routing.Route} route The route to unregister.
   */
  unregisterRoute(e) {
    if (!this._routes.has(e.method))
      throw new l("unregister-route-but-not-found-with-method", {
        method: e.method
      });
    const t = this._routes.get(e.method).indexOf(e);
    if (t > -1)
      this._routes.get(e.method).splice(t, 1);
    else
      throw new l("unregister-route-route-not-registered");
  }
}
let w;
const de = () => (w || (w = new ue(), w.addFetchListener(), w.addCacheListener()), w);
function I(s, e, t) {
  let n;
  if (typeof s == "string") {
    const i = new URL(s, location.href), r = ({ url: c }) => c.href === i.href;
    n = new R(r, e, t);
  } else if (s instanceof RegExp)
    n = new le(s, e, t);
  else if (typeof s == "function")
    n = new R(s, e, t);
  else if (s instanceof R)
    n = s;
  else
    throw new l("unsupported-route-type", {
      moduleName: "workbox-routing",
      funcName: "registerRoute",
      paramName: "capture"
    });
  return de().registerRoute(n), n;
}
function fe(s, e = []) {
  for (const t of [...s.searchParams.keys()])
    e.some((n) => n.test(t)) && s.searchParams.delete(t);
  return s;
}
function* pe(s, { ignoreURLParametersMatching: e = [/^utm_/, /^fbclid$/], directoryIndex: t = "index.html", cleanURLs: n = !0, urlManipulation: a } = {}) {
  const i = new URL(s, location.href);
  i.hash = "", yield i.href;
  const r = fe(i, e);
  if (yield r.href, t && r.pathname.endsWith("/")) {
    const c = new URL(r.href);
    c.pathname += t, yield c.href;
  }
  if (n) {
    const c = new URL(r.href);
    c.pathname += ".html", yield c.href;
  }
  if (a) {
    const c = a({ url: i });
    for (const o of c)
      yield o.href;
  }
}
class ge extends R {
  /**
   * @param {PrecacheController} precacheController A `PrecacheController`
   * instance used to both match requests and respond to fetch events.
   * @param {Object} [options] Options to control how requests are matched
   * against the list of precached URLs.
   * @param {string} [options.directoryIndex=index.html] The `directoryIndex` will
   * check cache entries for a URLs ending with '/' to see if there is a hit when
   * appending the `directoryIndex` value.
   * @param {Array<RegExp>} [options.ignoreURLParametersMatching=[/^utm_/, /^fbclid$/]] An
   * array of regex's to remove search params when looking for a cache match.
   * @param {boolean} [options.cleanURLs=true] The `cleanURLs` option will
   * check the cache for the URL with a `.html` added to the end of the end.
   * @param {workbox-precaching~urlManipulation} [options.urlManipulation]
   * This is a function that should take a URL and return an array of
   * alternative URLs that should be checked for precache matches.
   */
  constructor(e, t) {
    const n = ({ request: a }) => {
      const i = e.getURLsToCacheKeys();
      for (const r of pe(a.url, t)) {
        const c = i.get(r);
        if (c) {
          const o = e.getIntegrityForCacheKey(c);
          return { cacheKey: c, integrity: o };
        }
      }
    };
    super(n, e.strategy);
  }
}
function me(s) {
  const e = F(), t = new ge(e, s);
  I(t);
}
const we = "-precache-", ye = async (s, e = we) => {
  const n = (await self.caches.keys()).filter((a) => a.includes(e) && a.includes(self.registration.scope) && a !== s);
  return await Promise.all(n.map((a) => self.caches.delete(a))), n;
};
function _e() {
  self.addEventListener("activate", (s) => {
    const e = b.getPrecacheName();
    s.waitUntil(ye(e).then((t) => {
    }));
  });
}
function Re(s) {
  F().precache(s);
}
function be(s, e) {
  Re(s), me(e);
}
class Ce extends N {
  /**
   * @private
   * @param {Request|string} request A request to run this strategy for.
   * @param {workbox-strategies.StrategyHandler} handler The event that
   *     triggered the request.
   * @return {Promise<Response>}
   */
  async _handle(e, t) {
    let n = await t.cacheMatch(e), a;
    if (!n)
      try {
        n = await t.fetchAndCachePut(e);
      } catch (i) {
        i instanceof Error && (a = i);
      }
    if (!n)
      throw new l("no-response", { url: e.url, error: a });
    return n;
  }
}
const xe = {
  /**
   * Returns a valid response (to allow caching) if the status is 200 (OK) or
   * 0 (opaque).
   *
   * @param {Object} options
   * @param {Response} options.response
   * @return {Response|null}
   *
   * @private
   */
  cacheWillUpdate: async ({ response: s }) => s.status === 200 || s.status === 0 ? s : null
};
class Ee extends N {
  /**
   * @param {Object} [options]
   * @param {string} [options.cacheName] Cache name to store and retrieve
   * requests. Defaults to cache names provided by
   * {@link workbox-core.cacheNames}.
   * @param {Array<Object>} [options.plugins] [Plugins]{@link https://developers.google.com/web/tools/workbox/guides/using-plugins}
   * to use in conjunction with this caching strategy.
   * @param {Object} [options.fetchOptions] Values passed along to the
   * [`init`](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch#Parameters)
   * of [non-navigation](https://github.com/GoogleChrome/workbox/issues/1796)
   * `fetch()` requests made by this strategy.
   * @param {Object} [options.matchOptions] [`CacheQueryOptions`](https://w3c.github.io/ServiceWorker/#dictdef-cachequeryoptions)
   * @param {number} [options.networkTimeoutSeconds] If set, any network requests
   * that fail to respond within the timeout will fallback to the cache.
   *
   * This option can be used to combat
   * "[lie-fi]{@link https://developers.google.com/web/fundamentals/performance/poor-connectivity/#lie-fi}"
   * scenarios.
   */
  constructor(e = {}) {
    super(e), this.plugins.some((t) => "cacheWillUpdate" in t) || this.plugins.unshift(xe), this._networkTimeoutSeconds = e.networkTimeoutSeconds || 0;
  }
  /**
   * @private
   * @param {Request|string} request A request to run this strategy for.
   * @param {workbox-strategies.StrategyHandler} handler The event that
   *     triggered the request.
   * @return {Promise<Response>}
   */
  async _handle(e, t) {
    const n = [], a = [];
    let i;
    if (this._networkTimeoutSeconds) {
      const { id: o, promise: h } = this._getTimeoutPromise({ request: e, logs: n, handler: t });
      i = o, a.push(h);
    }
    const r = this._getNetworkPromise({
      timeoutId: i,
      request: e,
      logs: n,
      handler: t
    });
    a.push(r);
    const c = await t.waitUntil((async () => await t.waitUntil(Promise.race(a)) || // If Promise.race() resolved with null, it might be due to a network
    // timeout + a cache miss. If that were to happen, we'd rather wait until
    // the networkPromise resolves instead of returning null.
    // Note that it's fine to await an already-resolved promise, so we don't
    // have to check to see if it's still "in flight".
    await r)());
    if (!c)
      throw new l("no-response", { url: e.url });
    return c;
  }
  /**
   * @param {Object} options
   * @param {Request} options.request
   * @param {Array} options.logs A reference to the logs array
   * @param {Event} options.event
   * @return {Promise<Response>}
   *
   * @private
   */
  _getTimeoutPromise({ request: e, logs: t, handler: n }) {
    let a;
    return {
      promise: new Promise((r) => {
        a = setTimeout(async () => {
          r(await n.cacheMatch(e));
        }, this._networkTimeoutSeconds * 1e3);
      }),
      id: a
    };
  }
  /**
   * @param {Object} options
   * @param {number|undefined} options.timeoutId
   * @param {Request} options.request
   * @param {Array} options.logs A reference to the logs Array.
   * @param {Event} options.event
   * @return {Promise<Response>}
   *
   * @private
   */
  async _getNetworkPromise({ timeoutId: e, request: t, logs: n, handler: a }) {
    let i, r;
    try {
      r = await a.fetchAndCachePut(t);
    } catch (c) {
      c instanceof Error && (i = c);
    }
    return e && clearTimeout(e), (i || !r) && (r = await a.cacheMatch(t)), r;
  }
}
function q(s) {
  s.then(() => {
  });
}
const De = (s, e) => e.some((t) => s instanceof t);
let A, O;
function Te() {
  return A || (A = [
    IDBDatabase,
    IDBObjectStore,
    IDBIndex,
    IDBCursor,
    IDBTransaction
  ]);
}
function Ue() {
  return O || (O = [
    IDBCursor.prototype.advance,
    IDBCursor.prototype.continue,
    IDBCursor.prototype.continuePrimaryKey
  ]);
}
const V = /* @__PURE__ */ new WeakMap(), P = /* @__PURE__ */ new WeakMap(), $ = /* @__PURE__ */ new WeakMap(), T = /* @__PURE__ */ new WeakMap(), M = /* @__PURE__ */ new WeakMap();
function Le(s) {
  const e = new Promise((t, n) => {
    const a = () => {
      s.removeEventListener("success", i), s.removeEventListener("error", r);
    }, i = () => {
      t(f(s.result)), a();
    }, r = () => {
      n(s.error), a();
    };
    s.addEventListener("success", i), s.addEventListener("error", r);
  });
  return e.then((t) => {
    t instanceof IDBCursor && V.set(t, s);
  }).catch(() => {
  }), M.set(e, s), e;
}
function Pe(s) {
  if (P.has(s))
    return;
  const e = new Promise((t, n) => {
    const a = () => {
      s.removeEventListener("complete", i), s.removeEventListener("error", r), s.removeEventListener("abort", r);
    }, i = () => {
      t(), a();
    }, r = () => {
      n(s.error || new DOMException("AbortError", "AbortError")), a();
    };
    s.addEventListener("complete", i), s.addEventListener("error", r), s.addEventListener("abort", r);
  });
  P.set(s, e);
}
let k = {
  get(s, e, t) {
    if (s instanceof IDBTransaction) {
      if (e === "done")
        return P.get(s);
      if (e === "objectStoreNames")
        return s.objectStoreNames || $.get(s);
      if (e === "store")
        return t.objectStoreNames[1] ? void 0 : t.objectStore(t.objectStoreNames[0]);
    }
    return f(s[e]);
  },
  set(s, e, t) {
    return s[e] = t, !0;
  },
  has(s, e) {
    return s instanceof IDBTransaction && (e === "done" || e === "store") ? !0 : e in s;
  }
};
function ke(s) {
  k = s(k);
}
function Ne(s) {
  return s === IDBDatabase.prototype.transaction && !("objectStoreNames" in IDBTransaction.prototype) ? function(e, ...t) {
    const n = s.call(U(this), e, ...t);
    return $.set(n, e.sort ? e.sort() : [e]), f(n);
  } : Ue().includes(s) ? function(...e) {
    return s.apply(U(this), e), f(V.get(this));
  } : function(...e) {
    return f(s.apply(U(this), e));
  };
}
function Ie(s) {
  return typeof s == "function" ? Ne(s) : (s instanceof IDBTransaction && Pe(s), De(s, Te()) ? new Proxy(s, k) : s);
}
function f(s) {
  if (s instanceof IDBRequest)
    return Le(s);
  if (T.has(s))
    return T.get(s);
  const e = Ie(s);
  return e !== s && (T.set(s, e), M.set(e, s)), e;
}
const U = (s) => M.get(s);
function Me(s, e, { blocked: t, upgrade: n, blocking: a, terminated: i } = {}) {
  const r = indexedDB.open(s, e), c = f(r);
  return n && r.addEventListener("upgradeneeded", (o) => {
    n(f(r.result), o.oldVersion, o.newVersion, f(r.transaction), o);
  }), t && r.addEventListener("blocked", (o) => t(
    // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
    o.oldVersion,
    o.newVersion,
    o
  )), c.then((o) => {
    i && o.addEventListener("close", () => i()), a && o.addEventListener("versionchange", (h) => a(h.oldVersion, h.newVersion, h));
  }).catch(() => {
  }), c;
}
function ve(s, { blocked: e } = {}) {
  const t = indexedDB.deleteDatabase(s);
  return e && t.addEventListener("blocked", (n) => e(
    // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
    n.oldVersion,
    n
  )), f(t).then(() => {
  });
}
const Ke = ["get", "getKey", "getAll", "getAllKeys", "count"], Se = ["put", "add", "delete", "clear"], L = /* @__PURE__ */ new Map();
function W(s, e) {
  if (!(s instanceof IDBDatabase && !(e in s) && typeof e == "string"))
    return;
  if (L.get(e))
    return L.get(e);
  const t = e.replace(/FromIndex$/, ""), n = e !== t, a = Se.includes(t);
  if (
    // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
    !(t in (n ? IDBIndex : IDBObjectStore).prototype) || !(a || Ke.includes(t))
  )
    return;
  const i = async function(r, ...c) {
    const o = this.transaction(r, a ? "readwrite" : "readonly");
    let h = o.store;
    return n && (h = h.index(c.shift())), (await Promise.all([
      h[t](...c),
      a && o.done
    ]))[0];
  };
  return L.set(e, i), i;
}
ke((s) => ({
  ...s,
  get: (e, t, n) => W(e, t) || s.get(e, t, n),
  has: (e, t) => !!W(e, t) || s.has(e, t)
}));
try {
  self["workbox:expiration:7.4.0"] && _();
} catch {
}
const Ae = "workbox-expiration", y = "cache-entries", B = (s) => {
  const e = new URL(s, location.href);
  return e.hash = "", e.href;
};
class Oe {
  /**
   *
   * @param {string} cacheName
   *
   * @private
   */
  constructor(e) {
    this._db = null, this._cacheName = e;
  }
  /**
   * Performs an upgrade of indexedDB.
   *
   * @param {IDBPDatabase<CacheDbSchema>} db
   *
   * @private
   */
  _upgradeDb(e) {
    const t = e.createObjectStore(y, { keyPath: "id" });
    t.createIndex("cacheName", "cacheName", { unique: !1 }), t.createIndex("timestamp", "timestamp", { unique: !1 });
  }
  /**
   * Performs an upgrade of indexedDB and deletes deprecated DBs.
   *
   * @param {IDBPDatabase<CacheDbSchema>} db
   *
   * @private
   */
  _upgradeDbAndDeleteOldDbs(e) {
    this._upgradeDb(e), this._cacheName && ve(this._cacheName);
  }
  /**
   * @param {string} url
   * @param {number} timestamp
   *
   * @private
   */
  async setTimestamp(e, t) {
    e = B(e);
    const n = {
      url: e,
      timestamp: t,
      cacheName: this._cacheName,
      // Creating an ID from the URL and cache name won't be necessary once
      // Edge switches to Chromium and all browsers we support work with
      // array keyPaths.
      id: this._getId(e)
    }, i = (await this.getDb()).transaction(y, "readwrite", {
      durability: "relaxed"
    });
    await i.store.put(n), await i.done;
  }
  /**
   * Returns the timestamp stored for a given URL.
   *
   * @param {string} url
   * @return {number | undefined}
   *
   * @private
   */
  async getTimestamp(e) {
    const n = await (await this.getDb()).get(y, this._getId(e));
    return n == null ? void 0 : n.timestamp;
  }
  /**
   * Iterates through all the entries in the object store (from newest to
   * oldest) and removes entries once either `maxCount` is reached or the
   * entry's timestamp is less than `minTimestamp`.
   *
   * @param {number} minTimestamp
   * @param {number} maxCount
   * @return {Array<string>}
   *
   * @private
   */
  async expireEntries(e, t) {
    const n = await this.getDb();
    let a = await n.transaction(y).store.index("timestamp").openCursor(null, "prev");
    const i = [];
    let r = 0;
    for (; a; ) {
      const o = a.value;
      o.cacheName === this._cacheName && (e && o.timestamp < e || t && r >= t ? i.push(a.value) : r++), a = await a.continue();
    }
    const c = [];
    for (const o of i)
      await n.delete(y, o.id), c.push(o.url);
    return c;
  }
  /**
   * Takes a URL and returns an ID that will be unique in the object store.
   *
   * @param {string} url
   * @return {string}
   *
   * @private
   */
  _getId(e) {
    return this._cacheName + "|" + B(e);
  }
  /**
   * Returns an open connection to the database.
   *
   * @private
   */
  async getDb() {
    return this._db || (this._db = await Me(Ae, 1, {
      upgrade: this._upgradeDbAndDeleteOldDbs.bind(this)
    })), this._db;
  }
}
class We {
  /**
   * To construct a new CacheExpiration instance you must provide at least
   * one of the `config` properties.
   *
   * @param {string} cacheName Name of the cache to apply restrictions to.
   * @param {Object} config
   * @param {number} [config.maxEntries] The maximum number of entries to cache.
   * Entries used the least will be removed as the maximum is reached.
   * @param {number} [config.maxAgeSeconds] The maximum age of an entry before
   * it's treated as stale and removed.
   * @param {Object} [config.matchOptions] The [`CacheQueryOptions`](https://developer.mozilla.org/en-US/docs/Web/API/Cache/delete#Parameters)
   * that will be used when calling `delete()` on the cache.
   */
  constructor(e, t = {}) {
    this._isRunning = !1, this._rerunRequested = !1, this._maxEntries = t.maxEntries, this._maxAgeSeconds = t.maxAgeSeconds, this._matchOptions = t.matchOptions, this._cacheName = e, this._timestampModel = new Oe(e);
  }
  /**
   * Expires entries for the given cache and given criteria.
   */
  async expireEntries() {
    if (this._isRunning) {
      this._rerunRequested = !0;
      return;
    }
    this._isRunning = !0;
    const e = this._maxAgeSeconds ? Date.now() - this._maxAgeSeconds * 1e3 : 0, t = await this._timestampModel.expireEntries(e, this._maxEntries), n = await self.caches.open(this._cacheName);
    for (const a of t)
      await n.delete(a, this._matchOptions);
    this._isRunning = !1, this._rerunRequested && (this._rerunRequested = !1, q(this.expireEntries()));
  }
  /**
   * Update the timestamp for the given URL. This ensures the when
   * removing entries based on maximum entries, most recently used
   * is accurate or when expiring, the timestamp is up-to-date.
   *
   * @param {string} url
   */
  async updateTimestamp(e) {
    await this._timestampModel.setTimestamp(e, Date.now());
  }
  /**
   * Can be used to check if a URL has expired or not before it's used.
   *
   * This requires a look up from IndexedDB, so can be slow.
   *
   * Note: This method will not remove the cached entry, call
   * `expireEntries()` to remove indexedDB and Cache entries.
   *
   * @param {string} url
   * @return {boolean}
   */
  async isURLExpired(e) {
    if (this._maxAgeSeconds) {
      const t = await this._timestampModel.getTimestamp(e), n = Date.now() - this._maxAgeSeconds * 1e3;
      return t !== void 0 ? t < n : !0;
    } else
      return !1;
  }
  /**
   * Removes the IndexedDB object store used to keep track of cache expiration
   * metadata.
   */
  async delete() {
    this._rerunRequested = !1, await this._timestampModel.expireEntries(1 / 0);
  }
}
function Be(s) {
  j.add(s);
}
class G {
  /**
   * @param {ExpirationPluginOptions} config
   * @param {number} [config.maxEntries] The maximum number of entries to cache.
   * Entries used the least will be removed as the maximum is reached.
   * @param {number} [config.maxAgeSeconds] The maximum age of an entry before
   * it's treated as stale and removed.
   * @param {Object} [config.matchOptions] The [`CacheQueryOptions`](https://developer.mozilla.org/en-US/docs/Web/API/Cache/delete#Parameters)
   * that will be used when calling `delete()` on the cache.
   * @param {boolean} [config.purgeOnQuotaError] Whether to opt this cache in to
   * automatic deletion if the available storage quota has been exceeded.
   */
  constructor(e = {}) {
    this.cachedResponseWillBeUsed = async ({ event: t, request: n, cacheName: a, cachedResponse: i }) => {
      if (!i)
        return null;
      const r = this._isResponseDateFresh(i), c = this._getCacheExpiration(a);
      q(c.expireEntries());
      const o = c.updateTimestamp(n.url);
      if (t)
        try {
          t.waitUntil(o);
        } catch {
        }
      return r ? i : null;
    }, this.cacheDidUpdate = async ({ cacheName: t, request: n }) => {
      const a = this._getCacheExpiration(t);
      await a.updateTimestamp(n.url), await a.expireEntries();
    }, this._config = e, this._maxAgeSeconds = e.maxAgeSeconds, this._cacheExpirations = /* @__PURE__ */ new Map(), e.purgeOnQuotaError && Be(() => this.deleteCacheAndMetadata());
  }
  /**
   * A simple helper method to return a CacheExpiration instance for a given
   * cache name.
   *
   * @param {string} cacheName
   * @return {CacheExpiration}
   *
   * @private
   */
  _getCacheExpiration(e) {
    if (e === b.getRuntimeName())
      throw new l("expire-custom-caches-only");
    let t = this._cacheExpirations.get(e);
    return t || (t = new We(e, this._config), this._cacheExpirations.set(e, t)), t;
  }
  /**
   * @param {Response} cachedResponse
   * @return {boolean}
   *
   * @private
   */
  _isResponseDateFresh(e) {
    if (!this._maxAgeSeconds)
      return !0;
    const t = this._getDateHeaderTimestamp(e);
    if (t === null)
      return !0;
    const n = Date.now();
    return t >= n - this._maxAgeSeconds * 1e3;
  }
  /**
   * This method will extract the data header and parse it into a useful
   * value.
   *
   * @param {Response} cachedResponse
   * @return {number|null}
   *
   * @private
   */
  _getDateHeaderTimestamp(e) {
    if (!e.headers.has("date"))
      return null;
    const t = e.headers.get("date"), a = new Date(t).getTime();
    return isNaN(a) ? null : a;
  }
  /**
   * This is a helper method that performs two operations:
   *
   * - Deletes *all* the underlying Cache instances associated with this plugin
   * instance, by calling caches.delete() on your behalf.
   * - Deletes the metadata from IndexedDB used to keep track of expiration
   * details for each Cache instance.
   *
   * When using cache expiration, calling this method is preferable to calling
   * `caches.delete()` directly, since this will ensure that the IndexedDB
   * metadata is also cleanly removed and open IndexedDB instances are deleted.
   *
   * Note that if you're *not* using cache expiration for a given cache, calling
   * `caches.delete()` and passing in the cache's name should be sufficient.
   * There is no Workbox-specific method needed for cleanup in that case.
   */
  async deleteCacheAndMetadata() {
    for (const [e, t] of this._cacheExpirations)
      await self.caches.delete(e), await t.delete();
    this._cacheExpirations = /* @__PURE__ */ new Map();
  }
}
_e();
be([{"revision":"402b66900e731ca748771b6fc5e7a068","url":"registerSW.js"},{"revision":"88b4aca8f8a242553230f4db39fd6727","url":"index.html"},{"revision":"5f9bca532123a844e4a37a7a75d681e5","url":"favicon.svg"},{"revision":"f7279821789fa8bd143906bbbe17245e","url":"icons/icon-512.png"},{"revision":"2ac0a6c79c8b91133c926fc1cfffd30a","url":"icons/icon-192.png"},{"revision":"af43679abb459e94e13f5e599964bd9b","url":"icons/badge-72.png"},{"revision":"fb477870c32fd659a2a05be643a5338a","url":"icons/apple-touch-icon.png"},{"revision":null,"url":"assets/web-D7K77AJZ.js"},{"revision":null,"url":"assets/index-arkVWJXC.js"},{"revision":null,"url":"assets/index-CV4Cquht.js"},{"revision":null,"url":"assets/index-CG9QL-vu.js"},{"revision":null,"url":"assets/index-B01OYw5w.css"},{"revision":null,"url":"assets/index-74k4ml6r.js"},{"revision":"2ac0a6c79c8b91133c926fc1cfffd30a","url":"icons/icon-192.png"},{"revision":"f7279821789fa8bd143906bbbe17245e","url":"icons/icon-512.png"},{"revision":"fb477870c32fd659a2a05be643a5338a","url":"icons/apple-touch-icon.png"},{"revision":"647c4518a67855c55cff083891c18f32","url":"manifest.webmanifest"}]);
I(
  ({ url: s }) => s.pathname.startsWith("/api/"),
  new Ee({
    cacheName: "api-cache",
    plugins: [
      new G({
        maxEntries: 50,
        maxAgeSeconds: 300
      })
    ],
    networkTimeoutSeconds: 5
  })
);
I(
  ({ request: s }) => s.destination === "style" || s.destination === "script" || s.destination === "image" || s.destination === "font",
  new Ce({
    cacheName: "static-cache",
    plugins: [
      new G({
        maxEntries: 100,
        maxAgeSeconds: 86400 * 7
      })
    ]
  })
);
self.addEventListener("push", (s) => {
  if (s.data)
    try {
      const e = s.data.json(), t = {
        body: e.body || "有新资讯",
        icon: e.icon || "/icons/icon-192.png",
        badge: e.badge || "/icons/badge-72.png",
        tag: e.tag || "community-update",
        data: e.data || {},
        vibrate: e.vibrate || [200, 100, 200],
        requireInteraction: e.requireInteraction || !1,
        actions: e.actions || [],
        lang: "zh-CN",
        dir: "ltr"
      };
      s.waitUntil(
        self.registration.showNotification(e.title || "社群资讯", t)
      );
    } catch {
      s.waitUntil(
        self.registration.showNotification("社群资讯 · 新消息", {
          body: s.data.text(),
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-72.png"
        })
      );
    }
});
self.addEventListener("notificationclick", (s) => {
  var t;
  s.notification.close();
  const e = ((t = s.notification.data) == null ? void 0 : t.url) || "/";
  s.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: !0 }).then((n) => {
      for (const a of n)
        if (a.url.includes(self.location.origin) && "focus" in a) {
          a.focus(), a.postMessage({ type: "navigate", url: e });
          return;
        }
      clients.openWindow && clients.openWindow(e);
    })
  );
});
