import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";

export async function uploadDiaryPhoto(entryId, file) {
  const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const storageRef = ref(storage, `diary/${entryId}/${filename}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function deleteDiaryPhoto(url) {
  const { ref: refFromURL } = await import("firebase/storage");
  const storageRef = refFromURL(storage, url);
  await deleteObject(storageRef);
}
