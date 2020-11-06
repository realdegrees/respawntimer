import firebase from 'firebase';
import 'firebase/storage';
import 'firebase/firestore';
import { DocumentData } from '@firebase/firestore-types';
import { install } from 'source-map-support';
import { config } from 'dotenv';
import { ReadStream } from 'fs';
import logger from './logger';
import { InternalError } from '../src/common/errors/internal.error';

// Install source-map support for stacktrace
install({ hookRequire: true });
config();

type FilterOperator =
    '<' | '<=' | '==' | '>=' |
    '>' | '!=' | 'array-contains' |
    'array-contains-any' | 'in' | 'not-in';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface CollectionFilter {
    property: string;
    operator: FilterOperator;
    value: string;
}
class Firebase {
    private constructor(
        public readonly firestore: Firestore,
        public readonly storage: Storage) { }

    public static init(): Promise<Firebase> {
        return new Promise((resolve, reject) => {
            const configValue = process.env['FIREBASE_CONFIG'];
            if (!configValue) {
                reject('Environment variable "FIREBASE_CONFIG" not found!');
            }
            const config = JSON.parse(process.env['FIREBASE_CONFIG'] as string);
            const instance = firebase.initializeApp(config);
            const firestore = new Firestore(instance);
            const storage = new Storage(instance);

            resolve(new Firebase(firestore, storage));
        });
    }
}
class Storage {
    private storage: firebase.storage.Storage;

    public constructor(firebase: firebase.app.App) {
        this.storage = firebase.storage();
    }

    public async streamAudio(path: string): Promise<ReadStream> {
        const downloadUrl = await this.storage.ref(path).getDownloadURL();
        const response = await fetch(downloadUrl);
        const buffer = await response.arrayBuffer();
        return new ReadStream({
            read() {
                this.push(buffer);
                this.push(null);
            }
        });
    }

    public async saveAudio(path: string, audio: Buffer): Promise<string> {
        return this.storage.ref(path).put(audio)
            .then((snapshot) => snapshot.ref.getDownloadURL());
    }
}
class Firestore {
    private firestore: firebase.firestore.Firestore;

    public constructor(firebase: firebase.app.App) {
        this.firestore = firebase.firestore();
    }

    public get<T>(path: string): Promise<T> {
        return Promise.resolve(this.firestore.doc(path).get())
            .then((data) => data.data() as T)
            .catch((e: Error) => {
                logger.warn('Failed to get object from db', path, e);
                throw new InternalError(e.message);
            });
    }
    public store<T extends DocumentData>(data: T, path: string): Promise<void> {
        return Promise.resolve(this.firestore.doc(path).set(data))
            .then(() => logger.debug('Stored object in db', path, data))
            .catch((e: Error) => {
                logger.warn('Failed to store object in db', path, data);
                throw new InternalError(e.message);
            });
    }
    public update<T extends DocumentData>(data: T, path: string): Promise<void> {
        return Promise.resolve(this.firestore.doc(path).set(data, { merge: true }))
            .then(() => logger.debug('Stored object in db', path, data))
            .catch((e: Error) => {
                logger.warn('Failed to store object in db', path, data, e);
                throw new InternalError(e.message);
            });
    }
    public delete(path: string): Promise<void> {
        return path.split('/').length % 2 === 0 ?
            Promise.resolve(this.firestore.doc(path).delete())
                .then(() => logger.debug('Deleted db object', path))
                .catch((e: Error) => {
                    logger.warn('Failed to delete db object', path, e);
                    throw new InternalError(e.message);
                }) :
            Promise.resolve(this.firestore.collection(path))
                .then(async (ref) => {
                    const docs = (await ref.get()).docs;
                    await Promise.all(docs.map((doc) => this.delete(doc.ref.path)));
                });
    }
}

export default Firebase;