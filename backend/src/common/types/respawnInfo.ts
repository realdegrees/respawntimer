export interface WarInfo {
    respawn: {
        timeUntilRespawn: number;
        duration: number;
        durationNext: number;
        remainingRespawns: number;
        previousTimestamp?: number;
    };
    war: {
        timeLeftSeconds: number;
    };
}