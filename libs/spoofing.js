module.exports = function(){
    // Generate a unique seed per process launch so all sessions from
    // the same run share one canvas fingerprint (looks more natural)
    // but differ from other bot runs.
    const seed = Math.floor(Math.random() * 1000);
    return `(() => {
        const _canvasSeed = ${seed};
        // 1. Remove webdriver flag
        try {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        } catch(e) {}
        try { delete Object.getPrototypeOf(navigator).webdriver } catch(e) {}

        // 2. Fake plugins (real browsers have plugins)
        Object.defineProperty(navigator, 'plugins', {
            get: () => {
                const plugins = [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 },
                    { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 2 },
                ];
                plugins.item = (i) => plugins[i];
                plugins.namedItem = (n) => plugins.find(p => p.name === n) || null;
                plugins.refresh = () => {};
                Object.defineProperty(plugins, 'length', { get: () => plugins.length });
                return plugins;
            }
        });

        // 3. Realistic language settings
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(navigator, 'language', { get: () => 'en-US' });

        // 4. Fake hardware concurrency (real machines have cores)
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

        // 5. Fake device memory
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

        // 6. Hide automation in chrome object
        window.chrome = {
            app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
            runtime: { OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' }, OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' }, PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' }, PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' }, PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' }, RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' } }
        };

        // 7. Always appear focused/visible (prevents throttle detection)
        document.hasFocus = () => true;
        Object.defineProperty(Document.prototype, 'hidden', { get: () => false, enumerable: true, configurable: true });
        Object.defineProperty(Document.prototype, 'visibilityState', { get: () => 'visible', enumerable: true, configurable: true });

        // 8. Spoof screen dimensions to look like real display
        Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
        Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 100 });

        // 9. Prevent permission enumeration detection
        const originalQuery = window.navigator.permissions ? window.navigator.permissions.query : null;
        if (originalQuery) {
            window.navigator.permissions.query = (parameters) => {
                if (parameters.name === 'notifications') {
                    return Promise.resolve({ state: Notification.permission });
                }
                return originalQuery(parameters);
            };
        }

        // 10. Modernizr compatibility fix
        const elementDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
        Object.defineProperty(HTMLDivElement.prototype, 'offsetHeight', {
            ...elementDescriptor,
            get: function() { return 'modernizr' === this.id ? 1 : elementDescriptor.get.apply(this) }
        });

        // 11. Canvas fingerprint noise — adds imperceptible per-session pixel noise
        // so every bot run produces a unique canvas hash
        (function() {
            const _toDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function(type, ...args) {
                const ctx = this.getContext('2d');
                if (ctx) {
                    try {
                        const imageData = ctx.getImageData(0, 0, this.width || 1, this.height || 1);
                        const d = imageData.data;
                        // Shift a handful of barely-visible pixels using the seed
                        for (let i = 0; i < d.length; i += Math.floor(d.length / 8) + 1) {
                            d[i] = (d[i] + _canvasSeed) & 0xff;
                        }
                        ctx.putImageData(imageData, 0, 0);
                    } catch(e) {}
                }
                return _toDataURL.call(this, type, ...args);
            };

            const _getImageData = CanvasRenderingContext2D.prototype.getImageData;
            CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
                const imageData = _getImageData.call(this, x, y, w, h);
                const d = imageData.data;
                for (let i = 0; i < d.length; i += Math.floor(d.length / 8) + 1) {
                    d[i] = (d[i] + _canvasSeed) & 0xff;
                }
                return imageData;
            };
        })();

        // 12. WebGL fingerprint spoofing
        (function() {
            const getParam = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(param) {
                // UNMASKED_VENDOR_WEBGL
                if (param === 37445) return 'Intel Inc.';
                // UNMASKED_RENDERER_WEBGL
                if (param === 37446) return 'Intel Iris OpenGL Engine';
                return getParam.call(this, param);
            };
            // Also patch WebGL2
            if (typeof WebGL2RenderingContext !== 'undefined') {
                const getParam2 = WebGL2RenderingContext.prototype.getParameter;
                WebGL2RenderingContext.prototype.getParameter = function(param) {
                    if (param === 37445) return 'Intel Inc.';
                    if (param === 37446) return 'Intel Iris OpenGL Engine';
                    return getParam2.call(this, param);
                };
            }
        })();

        // 13. AudioContext fingerprint noise
        (function() {
            const _getChannelData = AudioBuffer.prototype.getChannelData;
            AudioBuffer.prototype.getChannelData = function(...args) {
                const data = _getChannelData.apply(this, args);
                for (let i = 0; i < data.length; i += Math.floor(data.length / 8) + 1) {
                    data[i] += (_canvasSeed * 0.0000001);
                }
                return data;
            };
        })();

    })()
    `
}