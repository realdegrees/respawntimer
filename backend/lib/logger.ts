/* eslint-disable no-console */
import chalk from 'chalk';
import { production, debug, logging } from '../src/common/util';
import { install } from 'source-map-support';

// Install source-map support for stacktrace
install({ hookRequire: true });

enum Level {
    INFO = '#ada700',
    LOG = '#008ead',
    DEBUG = '#00ad3a',
    WARNING = '#ad7300',
    ERROR = '#7d1500',
}
const warnEmptyStackTracesThreshold = 3;
let emptyStackTraces = 0;

let projectRoot = process.cwd() + '/';
let stackTraceDepth = 3;
class Logger {
    public constructor() {
        log(Level.DEBUG,
            'Degrees\' Logger Info',
            [
                'Degrees\' Logger uses process.cwd() to format the stacktrace!',
                'Make sure to start the node process from the project\'s root directory!',
                `Current working directory: ${process.cwd()}`
            ],
            true);
    }
    /**
     * @param path Absolute path to the projects root directory
     */
    public setProjectRoot(path: string): void {
        projectRoot = path.endsWith('/') ? path : path + '/';
    }
    /**
     * Sets the amount of calls from the stack trace that are displayed
     * Defaults to 3
     * @param depth 
     */
    public setStackTraceDepth(depth: number): void {
        stackTraceDepth = depth;
    }
    public log(message: string, ...optionalParams: unknown[]): void {
        log(Level.LOG, message, optionalParams);
    }
    public info(message: string, ...optionalParams: unknown[]): void {
        log(Level.INFO, message, optionalParams);
    }
    public warn(message: string, ...optionalParams: unknown[]): void {
        log(Level.WARNING, message, optionalParams);
    }
    public debug(message: string, ...optionalParams: unknown[]): void {
        log(Level.DEBUG, message, optionalParams);
    }
    public error(message: string, ...optionalParams: unknown[]): void {
        log(Level.ERROR, message, optionalParams);
    }
}
// eslint-disable-next-line @typescript-eslint/no-empty-function
const preLogHook = (): void => {
    // TODO
};
const afterLogHook = (): void => {
    if (emptyStackTraces === warnEmptyStackTracesThreshold) {
        emptyStackTraces++;

        log(Level.WARNING,
            'Degrees\' Logger Warning',
            [
                `Detected ${emptyStackTraces - 1} empty stack trace logs!`,
                `You may need to use Logger.setProjectRoot() 
                if [${process.cwd()} is not your project root.]`,
            ],
            true);
    }
};
const log = (level: Level,
    message: string,
    params: unknown[],
    noStackTrace?: boolean): void => {
    if (level === Level.DEBUG && !debug) {
        console.debug('Hiding debug log');
        return;
    }
    if (level === Level.LOG && production && !logging) {
        return;
    }

    preLogHook();

    const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    const coloredMessage = chalk.hex(level)(message);
    const stack = getStackTrace();
    stack.length = Math.min(stack.length, stackTraceDepth); // Applies the stackTraceDepth limit

    const stackSequence = noStackTrace ? '' : `(${stack.join(' <- ')})`;

    if (!noStackTrace && stack.every((call) => ['internal', 'external'].includes(call))) {
        emptyStackTraces++;
    }

    logFunc(level)(`[${timestamp}] ${coloredMessage} ${stackSequence}`);
    logParams(timestamp.length, level, params);

    afterLogHook();
};
const logParams = (indentation: number, level: Level, params: unknown[]): void => {
    if (params.length <= 0) {
        return;
    }
    params.forEach((param) => {
        if (Array.isArray(param)) {
            logParams(indentation, level, param);
            return;
        }
        logFunc(level)(`[${'~'.repeat(indentation)}] ${JSON.stringify(param)}`);
    });
};
const logFunc = (level: Level):
    (message?: unknown, ...optionalParams: unknown[]) => void => {
    switch (level) {
        case Level.LOG:
            return console.log;
        case Level.INFO:
            return console.info;
        case Level.WARNING:
            return console.warn;
        case Level.DEBUG:
            return console.debug;
        case Level.ERROR:
            return console.error;
    }
};
const getStackTrace = (): string[] => {

    const stack = new Error().stack;

    return stack ? stack
        .split('\n')
        .slice(4) // Remove logger function from stacktrace
        .map((line) => line.trim().split(' ').slice(-1)[0].replace(/[)(]/g, '')) // Extract the path
        .map((path) => mapNonProjectCalls(path)) // Hide internal and external calls
        .filter((call, index, paths) =>
            index === paths.length - 1 || paths[index + 1] !== call) // Remove duplice adjacent values
        .map((call) => call.replace(`${projectRoot}`, '').trim()) // Remove project root to shorten path
        : [];
};
const mapNonProjectCalls = (path: string): string => {
    if (path.includes(`${projectRoot}`)) {
        return path;
    } else if (path.includes('<anonymous>')) {
        return 'anonymous';
    } else if (path.startsWith('internal') || path.match(/.+\..+:/)) {
        return 'internal';
    } else {
        return path;
    }
};
export default new Logger();