import { RAIDHELPER_API_RATE_LIMIT_DAY } from "../common/constant"

/**
 * Returns the amount of time in ms until the next eventPoll should be scheduled based on number of events
 * @param numEvents Number of currently scheduled events
 * @returns 
 */
export const getEventPollingInterval = (numEvents: number): number => {
    return (24 * 60 * 60 * 1000) / (RAIDHELPER_API_RATE_LIMIT_DAY / (numEvents + 1)) + 60 * 1000
}