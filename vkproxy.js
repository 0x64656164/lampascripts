(function() {
    'use strict';

    console.log('[VK-Proxy] Постоянно активный прокси загружен');

    // ============================================
    // КОНФИГУРАЦИЯ
    // ============================================
    var CONFIG = {
        debug: false,
        proxyPath: '/vk-proxy/'
    };

    // ============================================
    // ПРОВЕРКА URL НА VK
    // ============================================
    function isVKUrl(url) {
        if (!url) return false;
        // Прямые VK URL
        if (url.indexOf('okcdn.ru') !== -1) return true;
        if (url.indexOf('vkvd') !== -1) return true;
        // Запросы через warp.cfhttp.top
        if (url.indexOf('warp.cfhttp.top') !== -1) return true;
        if (url.indexOf('cfhttp') !== -1) return true;
        return false;
    }

    // ============================================
    // ИЗВЛЕЧЕНИЕ ОРИГИНАЛЬНОГО VK URL
    // ============================================
    function extractVKUrl(url) {
        if (!url) return null;

        // Если это warp.cfhttp.top URL
        if (url.indexOf('warp.cfhttp.top') !== -1 || url.indexOf('cfhttp') !== -1) {
            try {
                // Извлекаем VK URL после прокси
                var match = url.match(/https?:\/\/[^\/]+\/(https?:\/\/vkvd[^&?]+)/);
                if (match && match[1]) {
                    var extracted = match[1];
                    // Если URL начинается с http://, заменяем на https://
                    if (extracted.indexOf('http://') === 0) {
                        extracted = extracted.replace('http://', 'https://');
                    }
                    // Декодируем URL если нужно
                    try {
                        extracted = decodeURIComponent(extracted);
                    } catch(e) {}
                    return extracted;
                }

                // Альтернативный способ: ищем vkvd в URL
                var vkMatch = url.match(/(https?:\/\/vkvd[0-9]+\.okcdn\.ru[^\s]*)/);
                if (vkMatch && vkMatch[1]) {
                    return vkMatch[1];
                }
            } catch(e) {
                console.log('[VK-Proxy] Ошибка извлечения URL:', e);
            }
        }

        // Если это уже прямой VK URL
        if (url.indexOf('okcdn.ru') !== -1 || url.indexOf('vkvd') !== -1) {
            return url;
        }

        return null;
    }

    // ============================================
    // SERVICE WORKER (встроенный)
    // ============================================
    function getServiceWorkerCode() {
        return `
// ============================================
// VK PROXY SERVICE WORKER
// ============================================

var VK_PROXY_PATH = '/vk-proxy/';
var cookieCache = {};

// Извлечение VK URL из warp.cfhttp.top
function extractVKUrl(url) {
    if (!url) return null;
    
    // Если это warp.cfhttp.top URL
    if (url.indexOf('warp.cfhttp.top') !== -1 || url.indexOf('cfhttp') !== -1) {
        try {
            var match = url.match(/https?:\\/\\/[^\\/]+\\/(https?:\\/\\/vkvd[^&?]+)/);
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
            var vkMatch = url.match(/(https?:\\/\\/vkvd[0-9]+\\.okcdn\\.ru[^\\s]*)/);
            if (vkMatch && vkMatch[1]) {
                return vkMatch[1];
            }
        } catch(e) {}
    }
    
    if (url.indexOf('okcdn.ru') !== -1 || url.indexOf('vkvd') !== -1) {
        return url;
    }
    
    return null;
}

// Получение куки
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

// Перехват всех запросов
self.addEventListener('fetch', function(event) {
    var url = event.request.url;
    
    // Если это запрос к нашему прокси
    if (url.indexOf(VK_PROXY_PATH) !== -1) {
        event.respondWith(handleProxyRequest(event));
        return;
    }
    
    // Если это запрос к VK или warp.cfhttp.top
    if (url.indexOf('okcdn.ru') !== -1 || 
        url.indexOf('vkvd') !== -1 ||
        url.indexOf('warp.cfhttp.top') !== -1 ||
        url.indexOf('cfhttp') !== -1) {
        event.respondWith(handleVKRequest(event));
        return;
    }
});

// Обработка прокси-запросов
async function handleProxyRequest(event) {
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
            'Connection': 'keep-alive',
            'Accept-Encoding': 'identity;q=1, *;q=0',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
        };
        
        if (cookie) {
            headers['Cookie'] = 'tstc=' + cookie;
        }
        
        var response = await fetch(targetUrl, { headers: headers });
        
        var responseHeaders = new Headers();
        response.headers.forEach(function(value, key) {
            if (key.toLowerCase() !== 'set-cookie' && 
                key.toLowerCase() !== 'content-encoding' &&
                key.toLowerCase() !== 'content-length') {
                responseHeaders.set(key, value);
            }
        });
        
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Cookie');
        responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
        
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });
    } catch(e) {
        return new Response('Proxy error: ' + e.message, { status: 500 });
    }
}

// Обработка VK и warp.cfhttp.top запросов
async function handleVKRequest(event) {
    try {
        var url = event.request.url;
        
        // Извлекаем оригинальный VK URL
        var vkUrl = extractVKUrl(url);
        if (!vkUrl) {
            // Если не удалось извлечь - пробуем как есть
            vkUrl = url;
        }
        
        var proxyUrl = '/vk-proxy/?url=' + encodeURIComponent(vkUrl);
        
        var response = await fetch(proxyUrl, {
            headers: event.request.headers
        });
        
        return response;
    } catch(e) {
        return new Response('VK error: ' + e.message, { status: 500 });
    }
}

console.log('[VK-Proxy] Service Worker активен');
`;
    }

    // ============================================
    // РЕГИСТРАЦИЯ SERVICE WORKER
    // ============================================
    function registerServiceWorker() {
        return new Promise(function(resolve, reject) {
            if (!('serviceWorker' in navigator)) {
                console.log('[VK-Proxy] Service Worker не поддерживается');
                resolve(null);
                return;
            }

            var swCode = getServiceWorkerCode();
            var swBlob = new Blob([swCode], { type: 'application/javascript' });
            var swUrl = URL.createObjectURL(swBlob);
            
            navigator.serviceWorker.register(swUrl, { scope: '/' })
                .then(function(registration) {
                    console.log('[VK-Proxy] Service Worker зарегистрирован');
                    resolve(registration);
                })
                .catch(function(error) {
                    console.log('[VK-Proxy] Ошибка регистрации SW:', error);
                    resolve(null);
                });
        });
    }

    // ============================================
    // ПАТЧИМ Lampa.Player
    // ============================================
    function patchLampaPlayer() {
        var originalPlay = Lampa.Player.play;
        var originalPlaylist = Lampa.Player.playlist;

        // Функция создания прокси-URL
        function getProxyUrl(originalUrl) {
            // Извлекаем оригинальный VK URL
            var vkUrl = extractVKUrl(originalUrl);
            if (!vkUrl) {
                // Если не удалось извлечь - возможно это не VK
                if (isVKUrl(originalUrl)) {
                    vkUrl = originalUrl;
                } else {
                    return originalUrl;
                }
            }

            // Если есть Service Worker - используем его
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                return '/vk-proxy/?url=' + encodeURIComponent(vkUrl);
            }
            
            // Fallback: возвращаем оригинальный URL
            return originalUrl;
        }

        // Перехват play()
        Lampa.Player.play = function(data) {
            var url = data.url || data.stream || '';
            
            if (isVKUrl(url)) {
                var proxyUrl = getProxyUrl(url);
                if (proxyUrl !== url) {
                    console.log('[VK-Proxy] Подмена URL:', url.substring(0, 60) + '...');
                    data.url = proxyUrl;
                    data.stream = proxyUrl;
                }
            }
            
            originalPlay.call(Lampa.Player, data);
        };

        // Перехват playlist()
        Lampa.Player.playlist = function(playlist) {
            if (!playlist || !playlist.length) {
                originalPlaylist.call(Lampa.Player, playlist);
                return;
            }

            var hasVK = false;
            playlist.forEach(function(item) {
                var url = item.url || item.stream || '';
                if (isVKUrl(url)) {
                    hasVK = true;
                    var proxyUrl = getProxyUrl(url);
                    if (proxyUrl !== url) {
                        item.url = proxyUrl;
                        item.stream = proxyUrl;
                    }
                }
            });

            originalPlaylist.call(Lampa.Player, playlist);
        };

        console.log('[VK-Proxy] Lampa.Player пропатчен');
    }

    // ============================================
    // ПАТЧИМ rc.js
    // ============================================
    function patchRcJs() {
        try {
            var bwarch = Lampa.Component.get('bwarch');
            if (bwarch && bwarch.prototype && bwarch.prototype.getFileUrl) {
                var originalGetFileUrl = bwarch.prototype.getFileUrl;
                
                bwarch.prototype.getFileUrl = function(file, call, waiting_rch) {
                    var url = file.stream || file.url || '';
                    
                    if (isVKUrl(url)) {
                        var vkUrl = extractVKUrl(url);
                        if (vkUrl) {
                            var proxyUrl = '/vk-proxy/?url=' + encodeURIComponent(vkUrl);
                            file.url = proxyUrl;
                            file.stream = proxyUrl;
                        }
                    }
                    
                    originalGetFileUrl.call(this, file, call, waiting_rch);
                };
                
                console.log('[VK-Proxy] rc.js пропатчен');
            }
        } catch (e) {
            console.log('[VK-Proxy] Не удалось пропатчить rc.js:', e);
        }
    }

    // ============================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================
    function init() {
        console.log('[VK-Proxy] Инициализация...');
        console.log('[VK-Proxy] Платформа:', Lampa.Platform.platform());
        
        registerServiceWorker()
            .then(function() {
                patchLampaPlayer();
                patchRcJs();
                console.log('[VK-Proxy] ✅ Полностью готов!');
                console.log('[VK-Proxy] Все VK видео будут работать автоматически');
            })
            .catch(function() {
                patchLampaPlayer();
                patchRcJs();
                console.log('[VK-Proxy] ✅ Работает в fallback-режиме');
            });
    }

    if (window.Lampa && Lampa.Player) {
        init();
    } else {
        document.addEventListener('lampa:load', init);
    }

})();
