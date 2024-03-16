import { Client } from "discord.js";
import audioManager from "./handlers/audioManager";
import raidhelperIntegration, {
  RaidhelperIntegration,
} from "./raidhelperIntegration";
import textManager from "./handlers/textManager";
import logger from "../lib/logger";

export class RespawnInterval {
  public static startInterval(): void {
    setInterval(() => {
      try {
        audioManager.interval();
        textManager.interval();
        RaidhelperIntegration.interval();
      } catch (e) {
        logger.error("[FATAL] Something went wrong in the interval!", e);
      }
    }, 1000);
  }
}
