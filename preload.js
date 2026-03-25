const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('seo', {
    start: (url, keyboard, count, option, headless) => ipcRenderer.invoke('start', url, keyboard, count, option, headless),
    stop: () => ipcRenderer.invoke('stop'),
    proxylist: () => ipcRenderer.invoke('proxylist')
})