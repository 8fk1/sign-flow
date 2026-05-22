const { ipcRenderer } = require('electron');


window.openDialog = () => {
    return ipcRenderer.invoke('open-dialog');
};
