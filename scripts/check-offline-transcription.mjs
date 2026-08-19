import { createOfflineCheckSummary, createOfflineEngineReport } from "../src/offline-transcription.mjs";

const report = await createOfflineEngineReport();

console.log("AutoSub offline transcription check");
console.log("");
console.log(createOfflineCheckSummary(report));
console.log("");

if (report.preferred?.status === "ready") {
  console.log(`Preferred engine: ${report.preferred.label}`);
} else {
  console.log("No offline engine is ready yet.");
}
