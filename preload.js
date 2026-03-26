const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('seo', {
    start: (url, keyboard, count, option, headless, concurrent) => ipcRenderer.invoke('start', url, keyboard, count, option, headless, concurrent),
    stop: () => ipcRenderer.invoke('stop'),
    proxylist: () => ipcRenderer.invoke('proxylist'),
    onStatsUpdate: (callback) => ipcRenderer.on('stats-update', (event, stats) => callback(stats))
})