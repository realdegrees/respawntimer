export interface WarInfo {
    respawn: {
        timeUntilRespawn: number;
        duration: number;
        durationNext: number;
        remainingRespawns: number;
    };
    war: {
        timeLeftSeconds: number;
    };
}