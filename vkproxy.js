(function() {
    'use strict';

    console.log('[VK-Proxy] Загрузка...');

    // ============================================
    // КОНФИГУРАЦИЯ
    // ============================================
    var CONFIG = {
        debug: true
    };

    // ============================================
    // ЛОГГЕР
    // ============================================
    function log() {
        if (CONFIG.debug) {
            console.log.apply(console, ['[VK-Proxy]'].concat(Array.from(arguments)));
        }
    }

    // ============================================
    // ПРОВЕРКА URL НА VK
    // ============================================
    function isVKUrl(url) {
        if (!url) return false;
        return url.indexOf('okcdn.ru') !== -1 || 
               url.indexOf('vkvd') !== -1 ||
               url.indexOf('warp.cfhttp.top') !== -1 ||
               url.indexOf('cfhttp') !== -1;
    }

    // ============================================
    // ИЗВЛЕЧЕНИЕ ОРИГИНАЛЬНОГО VK URL
    // ============================================
    function extractVKUrl(url) {
        if (!url) return null;

        // Если это warp.cfhttp.top URL
        if (url.indexOf('warp.cfhttp.top') !== -1 || url.indexOf('cfhttp') !== -1) {
            try {
                // Ищем VK URL после прокси
                var match = url.match(/https?:\/\/[^\/]+\/(https?:\/\/vkvd[^&?]+)/);
                if (match && match[1]) {
                    var extracted = match[1];
                    if (extracted.indexOf('http://') === 0) {
                        extracted = extracted.replace('http://', 'https://');
                    }
                    try {
                        extracted = decodeURIComponent(extracted);
                    } catch(e) {}
                    return extracted;
                }

                // Альтернативный поиск
                var vkMatch = url.match(/(https?:\/\/vkvd[0-9]+\.okcdn\.ru[^\s]*)/);
                if (vkMatch && vkMatch[1]) {
                    return vkMatch[1];
                }
            } catch(e) {
                log('Ошибка извлечения URL:', e);
            }
        }

        // Если это уже прямой VK URL
        if (url.indexOf('okcdn.ru') !== -1 || url.indexOf('vkvd') !== -1) {
            return url;
        }

        return null;
    }

    // ============================================
    // ПЕРЕХВАТ Lampa.Reguest
    // ============================================
    function patchLampaRequest() {
        // Сохраняем оригинальный метод
        var originalNative = Lampa.Reguest.prototype.native;
        var originalSilent = Lampa.Reguest.prototype.silent;

        // Функция для обработки URL
        function processUrl(url) {
            if (isVKUrl(url)) {
                var vkUrl = extractVKUrl(url);
                if (vkUrl) {
                    // Создаём прокси-ссылку через наш обработчик
                    var proxyUrl = '/vk-proxy/?url=' + encodeURIComponent(vkUrl);
                    log('Перехват VK URL:', url.substring(0, 60) + '...');
                    log('  → Извлечён VK URL:', vkUrl.substring(0, 60) + '...');
                    log('  → Прокси URL:', proxyUrl);
                    return proxyUrl;
                }
            }
            return url;
        }

        // Перехват native
        Lampa.Reguest.prototype.native = function(url, good, bad, data, params) {
            var processedUrl = processUrl(url);
            if (processedUrl !== url) {
                log('native: URL подменён');
                // Добавляем заголовки для прокси
                if (!params) params = {};
                if (!params.headers) params.headers = {};
                params.headers['X-VK-Proxy'] = '1';
                params.headers['X-Original-Url'] = encodeURIComponent(url);
            }
            return originalNative.call(this, processedUrl, good, bad, data, params);
        };

        // Перехват silent
        Lampa.Reguest.prototype.silent = function(url, good, bad, data, params) {
            var processedUrl = processUrl(url);
            if (processedUrl !== url) {
                log('silent: URL подменён');
                if (!params) params = {};
                if (!params.headers) params.headers = {};
                params.headers['X-VK-Proxy'] = '1';
                params.headers['X-Original-Url'] = encodeURIComponent(url);
            }
            return originalSilent.call(this, processedUrl, good, bad, data, params);
        };

        log('Lampa.Reguest пропатчен');
    }

    // ============================================
    // ПЕРЕХВАТ Lampa.Player
    // ============================================
    function patchLampaPlayer() {
        var originalPlay = Lampa.Player.play;
        var originalPlaylist = Lampa.Player.playlist;

        Lampa.Player.play = function(data) {
            var url = data.url || data.stream || '';
            if (isVKUrl(url)) {
                var vkUrl = extractVKUrl(url);
                if (vkUrl) {
                    var proxyUrl = '/vk-proxy/?url=' + encodeURIComponent(vkUrl);
                    log('Player.play: подмена URL');
                    data.url = proxyUrl;
                    data.stream = proxyUrl;
                    // Добавляем заголовки
                    if (!data.headers) data.headers = {};
                    data.headers['X-VK-Proxy'] = '1';
                    data.headers['X-Original-Url'] = encodeURIComponent(url);
                }
            }
            originalPlay.call(Lampa.Player, data);
        };

        Lampa.Player.playlist = function(playlist) {
            if (!playlist || !playlist.length) {
                originalPlaylist.call(Lampa.Player, playlist);
                return;
            }

            playlist.forEach(function(item) {
                var url = item.url || item.stream || '';
                if (isVKUrl(url)) {
                    var vkUrl = extractVKUrl(url);
                    if (vkUrl) {
                        var proxyUrl = '/vk-proxy/?url=' + encodeURIComponent(vkUrl);
                        item.url = proxyUrl;
                        item.stream = proxyUrl;
                        if (!item.headers) item.headers = {};
                        item.headers['X-VK-Proxy'] = '1';
                        item.headers['X-Original-Url'] = encodeURIComponent(url);
                    }
                }
            });

            originalPlaylist.call(Lampa.Player, playlist);
        };

        log('Lampa.Player пропатчен');
    }

    // ============================================
    // ПЕРЕХВАТ Lampa.Utils (дополнительно)
    // ============================================
    function patchLampaUtils() {
        if (Lampa.Utils && Lampa.Utils.addUrlComponent) {
            var originalAddUrlComponent = Lampa.Utils.addUrlComponent;
            Lampa.Utils.addUrlComponent = function(url, component) {
                if (isVKUrl(url)) {
                    var vkUrl = extractVKUrl(url);
                    if (vkUrl) {
                        url = vkUrl;
                    }
                }
                return originalAddUrlComponent.call(this, url, component);
            };
            log('Lampa.Utils.addUrlComponent пропатчен');
        }
    }

    // ============================================
    // SERVICE WORKER ДЛЯ ПРОКСИ
    // ============================================
    function getServiceWorkerCode() {
        return `
// VK PROXY SERVICE WORKER
var VK_PROXY_PATH = '/vk-proxy/';
var cookieCache = {};

function getCookie(url) {
    return new Promise(function(resolve) {
        if (cookieCache[url]) {
            resolve(cookieCache[url]);
            return;
        }
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('HEAD', url, true);
            xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            xhr.setRequestHeader('Range', 'bytes=0-1');
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    var setCookie = xhr.getResponseHeader('Set-Cookie');
                    if (setCookie) {
                        var match = setCookie.match(/tstc=([^;]+)/);
                        if (match && match[1]) {
                            cookieCache[url] = match[1];
                            resolve(match[1]);
                            return;
                        }
                    }
                    resolve(null);
                }
            };
            xhr.send();
        } catch(e) {
            resolve(null);
        }
    });
}

self.addEventListener('fetch', function(event) {
    var url = event.request.url;
    
    if (url.indexOf(VK_PROXY_PATH) !== -1) {
        event.respondWith(handleProxy(event));
        return;
    }
});

async function handleProxy(event) {
    try {
        var url = new URL(event.request.url);
        var targetUrl = url.searchParams.get('url');
        if (!targetUrl) {
            return new Response('Missing url', { status: 400 });
        }
        targetUrl = decodeURIComponent(targetUrl);
        
        var cookie = await getCookie(targetUrl);
        var headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Range': event.request.headers.get('Range') || 'bytes=0-',
            'Connection': 'keep-alive'
        };
        if (cookie) {
            headers['Cookie'] = 'tstc=' + cookie;
        }
        
        var response = await fetch(targetUrl, { headers: headers });
        var responseHeaders = new Headers();
        response.headers.forEach(function(value, key) {
            if (key.toLowerCase() !== 'set-cookie') {
                responseHeaders.set(key, value);
            }
        });
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
        
        return new Response(response.body, {
            status: response.status,
            headers: responseHeaders
        });
    } catch(e) {
        return new Response('Proxy error: ' + e.message, { status: 500 });
    }
}
`;
    }

    // ============================================
    // РЕГИСТРАЦИЯ SERVICE WORKER
    // ============================================
    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            log('Service Worker не поддерживается');
            return;
        }

        var swCode = getServiceWorkerCode();
        var swBlob = new Blob([swCode], { type: 'application/javascript' });
        var swUrl = URL.createObjectURL(swBlob);
        
        navigator.serviceWorker.register(swUrl, { scope: '/' })
            .then(function() {
                log('Service Worker зарегистрирован');
            })
            .catch(function(error) {
                log('Ошибка регистрации SW:', error);
            });
    }

    // ============================================
    // ПЕРЕХВАТ ВСЕХ FETCH ЗАПРОСОВ (дополнительно)
    // ============================================
    function patchFetch() {
        var originalFetch = window.fetch;
        window.fetch = function(input, init) {
            var url = typeof input === 'string' ? input : input.url;
            if (isVKUrl(url)) {
                var vkUrl = extractVKUrl(url);
                if (vkUrl) {
                    var proxyUrl = '/vk-proxy/?url=' + encodeURIComponent(vkUrl);
                    log('fetch: подмена URL');
                    if (typeof input === 'string') {
                        input = proxyUrl;
                    } else {
                        input = new Request(proxyUrl, input);
                    }
                    if (!init) init = {};
                    if (!init.headers) init.headers = {};
                    init.headers['X-VK-Proxy'] = '1';
                    init.headers['X-Original-Url'] = encodeURIComponent(url);
                }
            }
            return originalFetch.call(this, input, init);
        };
        log('fetch пропатчен');
    }

    // ============================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================
    function init() {
        log('Инициализация VK-прокси');
        
        // Регистрируем Service Worker
        registerServiceWorker();
        
        // Патчим все методы LAMPA
        patchLampaRequest();
        patchLampaPlayer();
        patchLampaUtils();
        patchFetch();
        
        log('✅ VK-прокси полностью готов!');
        log('Все VK ссылки будут перехватываться');
    }

    if (window.Lampa && Lampa.Reguest) {
        init();
    } else {
        document.addEventListener('lampa:load', init);
    }

})();
