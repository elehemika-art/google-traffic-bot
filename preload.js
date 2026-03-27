const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('seo', {
    start: (url, keyboard, count, option, headless, concurrent, minimize, useProxies) => ipcRenderer.invoke('start', url, keyboard, count, option, headless, concurrent, minimize, useProxies),
    stop: () => ipcRenderer.invoke('stop'),
    proxylist: () => ipcRenderer.invoke('proxylist'),
    onStatsUpdate: (callback) => ipcRenderer.on('stats-update', (event, stats) => callback(stats))
})