import { openDB, DBSchema, IDBPDatabase } from "idb";
import { Lecture, Settings } from "@/lib/types";

interface KyojikDB extends DBSchema {
  lectures: {
    key: string;
    value: Lecture;
    indexes: { "by-start": number; "by-status": string };
  };
  settings: { key: string; value: Settings };
}
const DEFAULT_PROFILE =
  "현재 주제 → 등장 이유 → 직전 개념의 문제/필요 → 새 개념의 역할 → 개념 관계 → 짧은 예 → 다음에 들을 부분 순서로 이해합니다. 정의 반복보다 인과관계와 구조를 우선하고, 빠진 한두 단계만 짧게 보충해 주세요.";
export const DEFAULT_SETTINGS: Settings = {
  density: "minimal",
  profile: DEFAULT_PROFILE,
  transcriptDisplay: "hidden",
};

export class IndexedDbLectureRepository {
  private db?: Promise<IDBPDatabase<KyojikDB>>;
  private getDb() {
    return (this.db ??= openDB<KyojikDB>("kyojik-helper", 1, {
      upgrade(db) {
        const lectures = db.createObjectStore("lectures", { keyPath: "id" });
        lectures.createIndex("by-start", "startedAt");
        lectures.createIndex("by-status", "status");
        db.createObjectStore("settings");
      },
    }));
  }
  async createLecture(lecture: Lecture) {
    await (await this.getDb()).put("lectures", lecture);
    return lecture;
  }
  async updateLecture(lecture: Lecture) {
    await (await this.getDb()).put("lectures", lecture);
  }
  async getLecture(id: string) {
    return (await this.getDb()).get("lectures", id);
  }
  async listLectures() {
    return (
      await (await this.getDb()).getAllFromIndex("lectures", "by-start")
    ).reverse();
  }
  async getActiveLecture() {
    const items = await (
      await this.getDb()
    ).getAllFromIndex("lectures", "by-status", "live");
    return items.sort((a, b) => b.startedAt - a.startedAt)[0];
  }
  async deleteLecture(id: string) {
    await (await this.getDb()).delete("lectures", id);
  }
  async clearAll() {
    const db = await this.getDb();
    const tx = db.transaction(["lectures", "settings"], "readwrite");
    await Promise.all([
      tx.objectStore("lectures").clear(),
      tx.objectStore("settings").clear(),
      tx.done,
    ]);
  }
  async getSettings() {
    return (
      (await (await this.getDb()).get("settings", "main")) ?? DEFAULT_SETTINGS
    );
  }
  async saveSettings(settings: Settings) {
    await (await this.getDb()).put("settings", settings, "main");
  }
}
export const repository = new IndexedDbLectureRepository();
