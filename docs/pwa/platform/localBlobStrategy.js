// The PWA's implementation of js/alarm/localSourceAdapter.js's strategy
// interface — see that file for the contract and why it exists.
import { putBlob, getBlob } from "./blobStore.js";

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
          const file = input.files?.[0];
          resolve(file ? await storeFile(file) : null);
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
};
