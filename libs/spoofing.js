module.exports = function(){
    return `(() => {
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
    })()
    `
}