import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, deleteDoc,
  query, where, orderBy,
  Timestamp, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const COLLECTION = "diary_entries";

export async function getDiaryEntries(lang) {
  const ref = collection(db, COLLECTION);
  const constraints = [
    where("published", "==", true),
    orderBy("publishedAt", "desc"),
  ];
  if (lang) constraints.splice(1, 0, where("lang", "==", lang));
  const snap = await getDocs(query(ref, ...constraints));
  return snap.docs.map((d) => firestoreToEntry(d.id, d.data()));
}

export async function getDiaryEntriesByKeyword(keyword) {
  const snap = await getDocs(query(
    collection(db, COLLECTION),
    where("published", "==", true),
    where("keywords", "array-contains", keyword),
    orderBy("publishedAt", "desc")
  ));
  return snap.docs.map((d) => firestoreToEntry(d.id, d.data()));
}

export async function getDiaryEntry(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return firestoreToEntry(snap.id, snap.data());
}

export async function createDiaryEntry(input) {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...input,
    coverPhotoIndex: input.coverPhotoIndex ?? 0,
    lang: input.lang ?? "ja",
    published: input.published ?? false,
    publishedAt: input.publishedAt
      ? Timestamp.fromDate(new Date(input.publishedAt))
      : serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateDiaryEntry(id, input) {
  await updateDoc(doc(db, COLLECTION, id), {
    ...input,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDiaryEntry(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

function firestoreToEntry(id, data) {
  const toDate = (v) => v instanceof Timestamp ? v.toDate() : new Date(v ?? Date.now());
  return {
    id,
    title: data.title ?? "",
    body: data.body ?? "",
    keywords: data.keywords ?? [],
    photoUrls: data.photoUrls ?? [],
    coverPhotoIndex: data.coverPhotoIndex ?? 0,
    lang: data.lang ?? "ja",
    published: Boolean(data.published),
    publishedAt: toDate(data.publishedAt),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}
