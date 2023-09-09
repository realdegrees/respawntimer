import { connect } from 'mongoose';
import logger from '../../lib/logger';

let instance: Database | undefined = undefined;
class Database {
    private constructor() { }
    public static init(): Promise<void> {
        const mongoUser = process.env['MONGO_USER'];
        const mongoPass = process.env['MONGO_PASS'];
        const mongoHost = process.env['MONGO_HOST'] ?? 'mongo';
        const mongoPort = process.env['MONGO_PORT'] ?? '27017';
        const mongoAuth = mongoUser && mongoPass ? `${mongoUser}:${mongoPass}@` : '';
        return connect(`mongodb://${mongoAuth}${mongoHost}:${mongoPort}`).then(() => {
            logger.info('Succuessfuly connected to MongoDB');
            instance = new Database();
        });
    }
    public static getInstance(): Promise<Database> {
        return new Promise<Database>((res) => {
            const interval = setInterval(() => {
                if (instance) {
                    clearInterval(interval);
                    res(instance);
                }
            }, 1000);
        });
    }
}
export default Database;