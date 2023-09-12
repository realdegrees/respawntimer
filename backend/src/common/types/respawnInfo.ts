export interface WarInfo {
    respawn: {
        timeUntilRespawn: number;
        duration: number;
        durationNext: number;
        remaining: number;
    };
    war: {
        timeLeftSeconds: number;
    };
}