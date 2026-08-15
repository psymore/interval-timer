// The PWA's implementation of js/alarm/localSourceAdapter.js's strategy
// interface — see that file for the contract and why it exists.
import { putBlob, getBlob, deleteBlob } from "./blobStore.js";

async function storeFile(file) {
  await putBlob(file.name, file);
  return file.name;
}

export const pwaLocalSourceStrategy = {
  async pick() {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "audio/*,.mp3,.wav,.ogg";
      input.addEventListener(
        "change",
        async () => {
          try {
            const file = input.files?.[0];
            resolve(file ? await storeFile(file) : null);
          } catch (e) {
            // storeFile()/putBlob() can reject (e.g. QuotaExceededError on a
            // large audio file). Without this catch, the throw inside this
            // async listener has nowhere to go — resolve() never runs and
            // pick()'s outer Promise hangs forever, leaving the caller
            // (alarmModal.js's chooseAlarmBtn handler) stuck with no
            // feedback. Resolve null so its existing
            // "no file selected" handling kicks in instead.
            console.error("localBlobStrategy: failed to store picked file:", e);
            resolve(null);
          }
        },
        { once: true },
      );
      input.click();
    });
  },
  async fromDroppedFile(file) {
    return storeFile(file);
  },
  async registerExisting(value) {
    return Boolean(await getBlob(value));
  },
  async getPlayableUrl(value) {
    const blob = await getBlob(value);
    if (!blob) throw new Error(`Local alarm file not found: ${value}`);
    return URL.createObjectURL(blob);
  },
  async exists(value) {
    return Boolean(await getBlob(value));
  },
  // pick()/fromDroppedFile() above already wrote this blob to IndexedDB
  // (unlike Electron's strategy, they have to — see the comment at the top
  // of this file) before the caller had a chance to validate the
  // extension. When that validation rejects the file, the caller calls
  // this to undo the speculative write instead of leaking it.
  async unregister(value) {
    await deleteBlob(value);
  },
};
