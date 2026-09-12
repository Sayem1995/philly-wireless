// Diagnostic: why does the server reject a valid Firebase ID token?
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const token = process.env.DIAG_TOKEN ?? "";
process.env.FIREBASE_PROJECT_ID ||= "philly-repair";

console.log("projectId:", process.env.FIREBASE_PROJECT_ID);
if (getApps().length === 0) initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });

try {
  const decoded = await getAuth().verifyIdToken(token);
  console.log("VERIFY OK -> uid:", decoded.uid, "aud:", decoded.aud, "iss:", decoded.iss);
} catch (err) {
  const e = err as { code?: string; message?: string };
  console.log("VERIFY FAILED");
  console.log("  code   :", e?.code);
  console.log("  message:", e?.message);
}
process.exit(0);
