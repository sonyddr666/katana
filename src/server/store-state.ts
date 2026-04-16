import { promises as fs } from "fs";

import { config } from "./config/env";

export interface StoreState {
  store_enabled: boolean;
}

const DEFAULT_STATE: StoreState = {
  store_enabled: false
};

export async function getStoreState(): Promise<StoreState> {
  try {
    const raw = await fs.readFile(config.storeStateFile, "utf-8");
    const parsed = JSON.parse(raw) as Partial<StoreState>;
    return {
      store_enabled: Boolean(parsed.store_enabled)
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      await setStoreState(DEFAULT_STATE.store_enabled);
      return { ...DEFAULT_STATE };
    }
    throw error;
  }
}

export async function setStoreState(enabled: boolean): Promise<StoreState> {
  const state: StoreState = {
    store_enabled: Boolean(enabled)
  };
  await fs.writeFile(config.storeStateFile, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  return state;
}
