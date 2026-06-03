import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, query, orderBy,
  serverTimestamp, Timestamp, onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

export const PRODUCT_GRAMS = {
  "珈琲袋_200g": 200,
  "珈琲袋_100g": 100,
  "一煎袋_10g": 10,
  "定期便_200g": 200,
  "定期便_100g": 100,
};

export function calcRoastedGrams(rawGrams, yieldRate = 0.85) {
  return Math.floor(rawGrams * yieldRate);
}

export function getStockStatus(bean) {
  const roasted = calcRoastedGrams(bean.rawGrams, bean.roastYieldRate);
  if (roasted <= 0) return "out";
  if (bean.rawGrams <= bean.lowStockThresholdGrams) return "low";
  return "ok";
}

export function calcAvailableCounts(bean) {
  const roasted = calcRoastedGrams(bean.rawGrams, bean.roastYieldRate);
  const result = {};
  for (const [key, grams] of Object.entries(PRODUCT_GRAMS)) {
    result[key] = Math.floor(roasted / grams);
  }
  return result;
}

const BEAN_COL = "inventory";
const LOG_COL  = "inventory_logs";

export async function getBeans() {
  const snap = await getDocs(collection(db, BEAN_COL));
  return snap.docs.map((d) => beanFromDoc(d.id, d.data()));
}

export async function adjustStock(beanId, deltaGrams, type, note = "") {
  const beanRef = doc(db, BEAN_COL, beanId);
  const snap = await getDoc(beanRef);
  if (!snap.exists()) throw new Error(`Bean ${beanId} not found`);
  const current = snap.data().rawGrams;
  const next = Math.max(0, current + deltaGrams);
  await updateDoc(beanRef, { rawGrams: next, updatedAt: serverTimestamp() });
  await addDoc(collection(db, LOG_COL), {
    beanId, type, grams: Math.abs(deltaGrams), note, createdAt: serverTimestamp(),
  });
}

export function subscribeBean(beanId, callback) {
  return onSnapshot(doc(db, BEAN_COL, beanId), (snap) => {
    if (snap.exists()) callback(beanFromDoc(snap.id, snap.data()));
  });
}

function beanFromDoc(id, d) {
  const toDate = (v) => v instanceof Timestamp ? v.toDate() : new Date();
  return {
    id,
    name: d.name,
    origin: d.origin,
    roastLevel: d.roastLevel,
    rawGrams: d.rawGrams,
    roastYieldRate: d.roastYieldRate ?? 0.85,
    lowStockThresholdGrams: d.lowStockThresholdGrams ?? 500,
    updatedAt: toDate(d.updatedAt),
  };
}
