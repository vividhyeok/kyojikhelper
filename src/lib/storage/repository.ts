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
const LEGACY_PROFILE = "현재 주제 → 등장 이유 → 직전 개념의 문제/필요 → 새 개념의 역할 → 개념 관계 → 짧은 예 → 다음에 들을 부분 순서로 이해합니다. 정의 반복보다 인과관계와 구조를 우선하고, 빠진 한두 단계만 짧게 보충해 주세요.";
const DEFAULT_PROFILE =
  "먼저 전체 구조와 지금 교수의 설명 동작을 알아야 세부 설명을 이해합니다. 새 용어의 뜻보다 왜 지금 나왔는지, 앞 개념과 인과·비교·사례·범주·역사적 순서 중 어떤 관계인지 알려 주세요. 모든 전환을 문제→해결로 만들지 마세요. 추상어를 추상어로 재정의하지 말고 꼭 필요할 때만 짧은 구체적 예 하나를 주세요. 교수 설명이 충분하면 개입하지 마세요. 아직 관계가 설명되지 않았다면 창작하지 말고 다음에 무엇을 들을지 알려 주세요. 흐름을 놓쳤을 때는 세부 요약보다 현재 위치와 여기까지 온 이유를 복구해 주세요. 교수 주장과 AI 추론·배경지식은 구분해 주세요.";
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
    const saved = await (await this.getDb()).get("settings", "main");
    return saved ? { ...saved, profile: saved.profile === LEGACY_PROFILE ? DEFAULT_PROFILE : saved.profile } : DEFAULT_SETTINGS;
  }
  async saveSettings(settings: Settings) {
    await (await this.getDb()).put("settings", settings, "main");
  }
}
export const repository = new IndexedDbLectureRepository();
