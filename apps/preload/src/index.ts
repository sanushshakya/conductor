import { contextBridge, ipcRenderer } from 'electron'
import { buildApi } from './api'

/**
 * The only bridge between the renderer and the main process.
 *
 * `contextIsolation` is on and `nodeIntegration` is off, so this file is the
 * complete list of things the UI can do outside its own sandbox.
 */
contextBridge.exposeInMainWorld('conductor', buildApi(ipcRenderer))
