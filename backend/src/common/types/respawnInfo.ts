export interface WarInfo {
    respawn: {
        timePassed: number;
        duration: number;
        durationNext: number;
        remaining: number;
    };
    war: {
        timeLeftSeconds: number;
    };
}