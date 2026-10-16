<!-- mid: 20261015-451e | t: 2026-10-15 16:31:52 | p: LANTransfer | src: auto | tags: #lantransfer #card-actions #web #plugin #mobile #download -->
LANTransfer card action convention: text cards provide copy only, file cards provide download only, image cards provide both copy and download; web pages never show delete, while the uTools plugin window shows delete. Plugin-side download is implemented through `saveItem`, which uses `utools.showSaveDialog`, copies the stored file to the selected path, and returns `null` on cancel (cancel should not toast success).

