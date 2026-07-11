/**
 * Expone un flag mínimo al renderer (sin Node en la página).
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('FisicaHNDesktop', {
  isDesktop: true,
  platform: process.platform
});
